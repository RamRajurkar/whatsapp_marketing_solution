from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from app.routes.auth import get_current_user
from app.database import db
from app.config import settings
from bson import ObjectId
from datetime import datetime, timezone
import os
import io
import csv
import re
import httpx
import mimetypes
import pytz
from app.celery_app import celery_app
from app.utils.phone import normalize_indian_phone
from app.utils.image_utils import compress_image_bytes
from app.tasks.broadcast_task import send_broadcast as send_broadcast_task
from app.http_client import get_http_client
from app.utils.tenant import get_tenant_filter, inject_tenant_id

router = APIRouter()


def _now():
    return datetime.now(timezone.utc)


def _get_scheduled_eta(scheduled_at_str: Optional[str]) -> Optional[datetime]:
    if not scheduled_at_str:
        return None
    try:
        dt = datetime.fromisoformat(scheduled_at_str)
        if dt.tzinfo is None:
            ist = pytz.timezone("Asia/Kolkata")
            dt = ist.localize(dt)
        return dt.astimezone(timezone.utc)
    except Exception as e:
        print(f"[Broadcast Schedule] Failed to parse scheduledAt '{scheduled_at_str}': {e}")
        return None


class BroadcastCreate(BaseModel):
    name: str
    templateName: str
    templateLanguage: str = "en"
    audienceTags: Optional[List[str]] = []
    audienceType: Optional[str] = "tags"  # "tags" | "csv"
    csvAudience: Optional[List[Dict[str, Any]]] = None
    scheduledAt: Optional[str] = None
    recurringSchedule: Optional[str] = "none"  # "none" | "daily" | "weekly" | "monthly"
    category: Optional[str] = "MARKETING"
    estimatedCost: Optional[float] = 0.0
    status: str = "draft"
    templateComponents: Optional[List[dict]] = None
    headerMediaUrl: Optional[str] = None
    headerMediaId: Optional[str] = None
    bodyParams: Optional[List[str]] = None
    buttonParams: Optional[List[str]] = None
    carouselCards: Optional[List[dict]] = None
    speedMps: Optional[int] = None


@router.post("/parse-csv")
async def parse_broadcast_csv(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """
    Parse uploaded CSV file for broadcast campaign audience and dynamic variables.
    Detects phone, name, and parameter columns.
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are supported")

    content = await file.read()
    text = content.decode("utf-8-sig", errors="ignore")
    stream = io.StringIO(text)
    reader = csv.reader(stream)

    rows = list(reader)
    if not rows or len(rows) < 2:
        raise HTTPException(status_code=400, detail="CSV file is empty or missing headers")

    raw_headers = [h.strip() for h in rows[0]]
    lower_headers = [h.lower() for h in raw_headers]

    phone_idx = -1
    name_idx = -1

    phone_keywords = ["phone", "mobile", "number", "whatsapp", "phone_number", "contact", "to", "recipient"]
    name_keywords = ["name", "customer_name", "full_name", "contact_name", "customer"]

    for i, h in enumerate(lower_headers):
        if phone_idx == -1 and any(k in h for k in phone_keywords):
            phone_idx = i
        if name_idx == -1 and any(k in h for k in name_keywords):
            name_idx = i

    if phone_idx == -1:
        phone_idx = 0

    if name_idx == -1:
        name_idx = 1 if len(raw_headers) > 1 else 0

    parsed_recipients = []
    preview_rows = []

    for row_idx, row in enumerate(rows[1:], start=1):
        if not row or not any(cell.strip() for cell in row):
            continue

        raw_phone = row[phone_idx].strip() if phone_idx < len(row) else ""
        if not raw_phone:
            continue

        try:
            phone = normalize_indian_phone(raw_phone)
        except Exception:
            phone = re.sub(r"\D", "", raw_phone)

        name = row[name_idx].strip() if (name_idx < len(row) and name_idx != phone_idx) else phone
        if not name:
            name = phone

        params = []
        for i, val in enumerate(row):
            if i != phone_idx:
                params.append(val.strip())

        rec_item = {
            "phone": phone,
            "name": name,
            "params": params,
            "raw_row": {raw_headers[i]: row[i].strip() for i in range(min(len(raw_headers), len(row)))}
        }

        parsed_recipients.append(rec_item)
        if len(preview_rows) < 5:
            preview_rows.append(rec_item)

    return {
        "filename": file.filename,
        "total_rows": len(parsed_recipients),
        "headers": raw_headers,
        "phone_header": raw_headers[phone_idx] if phone_idx < len(raw_headers) else "",
        "name_header": raw_headers[name_idx] if name_idx < len(raw_headers) else "",
        "preview_rows": preview_rows,
        "parsed_recipients": parsed_recipients,
    }


@router.get("")
@router.get("/")
async def get_broadcasts(current_user: dict = Depends(get_current_user)):
    """Get all broadcast campaigns."""
    tenant_filter = get_tenant_filter(current_user)
    
    cursor = db.db.broadcasts.find(tenant_filter).sort("createdAt", -1)
    broadcasts = await cursor.to_list(length=100)
    for b in broadcasts:
        b["_id"] = str(b["_id"])
    return broadcasts


async def _save_csv_audience_chunks(broadcast_id: str, csv_audience: list):
    """Save large CSV audience array in chunked MongoDB documents to prevent BSON > 16MB errors."""
    if not csv_audience:
        return
    await db.db.broadcast_audiences.delete_many({"broadcastId": broadcast_id})
    CHUNK_SIZE = 2000
    chunk_docs = []
    for i in range(0, len(csv_audience), CHUNK_SIZE):
        chunk = csv_audience[i:i + CHUNK_SIZE]
        chunk_docs.append({
            "broadcastId": broadcast_id,
            "chunk_index": i // CHUNK_SIZE,
            "recipients": chunk,
            "createdAt": _now()
        })
    if chunk_docs:
        await db.db.broadcast_audiences.insert_many(chunk_docs)


@router.post("")
@router.post("/")
async def create_broadcast(data: BroadcastCreate, current_user: dict = Depends(get_current_user)):
    """Create a new broadcast campaign."""
    doc = data.model_dump()
    now = _now()
    doc["createdAt"] = now
    doc["updatedAt"] = now
    doc["stats"] = {"total": 0, "sent": 0, "failed": 0}
    inject_tenant_id(doc, current_user)

    # Pop csvAudience to prevent BSON > 16MB error on db.broadcasts insert
    csv_aud = doc.pop("csvAudience", None)
    if csv_aud:
        doc["totalCsvRecipients"] = len(csv_aud)

    scheduled_at = doc.get("scheduledAt")
    eta_utc = _get_scheduled_eta(scheduled_at)

    if eta_utc and eta_utc > now:
        doc["status"] = "scheduled"

    result = await db.db.broadcasts.insert_one(doc)
    broadcast_id = str(result.inserted_id)
    doc["_id"] = broadcast_id

    # Store CSV audience in chunked MongoDB collection
    if csv_aud:
        await _save_csv_audience_chunks(broadcast_id, csv_aud)

    if eta_utc and eta_utc > now:
        wa_phone_id = current_user.get("waPhoneNumberId") or settings.WA_PHONE_NUMBER_ID
        wa_token    = current_user.get("waAccessToken")    or settings.WA_ACCESS_TOKEN
        tenant_id   = str(current_user["_id"]) if settings.APP_MODE == "saas" else None

        if wa_phone_id and wa_token:
            task = send_broadcast_task.apply_async(
                kwargs={
                    "broadcast_id": broadcast_id,
                    "wa_phone_id": wa_phone_id,
                    "wa_token": wa_token,
                    "template_name": doc["templateName"],
                    "template_lang": doc.get("templateLanguage", "en"),
                    "template_components": doc.get("templateComponents"),
                    "header_media_url": doc.get("headerMediaUrl"),
                    "header_media_id": doc.get("headerMediaId"),
                    "body_params": doc.get("bodyParams"),
                    "carousel_cards": doc.get("carouselCards"),
                    "audience_tags": doc.get("audienceTags"),
                    "tenant_id": tenant_id,
                    "speed_mps": doc.get("speedMps"),
                },
                eta=eta_utc
            )
            await db.db.broadcasts.update_one({"_id": ObjectId(broadcast_id)}, {"$set": {"celeryTaskId": task.id}})
            doc["celeryTaskId"] = task.id

    return doc


@router.delete("/{broadcast_id}")
async def delete_broadcast(broadcast_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a broadcast campaign."""
    try:
        obj_id = ObjectId(broadcast_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid broadcast ID")

    tenant_filter = get_tenant_filter(current_user)
    delete_query = {"_id": obj_id}
    if tenant_filter:
        delete_query = {"$and": [delete_query, tenant_filter]}

    broadcast = await db.db.broadcasts.find_one(delete_query)
    if broadcast and broadcast.get("celeryTaskId"):
        try:
            celery_app.control.revoke(broadcast["celeryTaskId"], terminate=True)
        except Exception:
            pass

    result = await db.db.broadcasts.delete_one(delete_query)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    return {"message": "Broadcast deleted"}


@router.put("/{broadcast_id}")
async def update_broadcast(broadcast_id: str, data: BroadcastCreate, current_user: dict = Depends(get_current_user)):
    """Update an existing broadcast campaign."""
    try:
        obj_id = ObjectId(broadcast_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid broadcast ID")

    tenant_filter = get_tenant_filter(current_user)
    broadcast_query = {"_id": obj_id}
    if tenant_filter:
        broadcast_query = {"$and": [broadcast_query, tenant_filter]}

    broadcast = await db.db.broadcasts.find_one(broadcast_query)
    if not broadcast:
        raise HTTPException(status_code=404, detail="Broadcast not found")
        
    if broadcast.get("status") not in ("draft", "scheduled"):
        raise HTTPException(status_code=400, detail="Only draft or scheduled broadcasts can be edited")

    update_data = data.model_dump(exclude_unset=True)
    now = _now()
    update_data["updatedAt"] = now

    csv_aud = update_data.pop("csvAudience", None)
    if csv_aud:
        update_data["totalCsvRecipients"] = len(csv_aud)
        await _save_csv_audience_chunks(broadcast_id, csv_aud)
    
    scheduled_at = update_data.get("scheduledAt")
    eta_utc = _get_scheduled_eta(scheduled_at)
    if eta_utc and eta_utc > now:
        update_data["status"] = "scheduled"
        if broadcast.get("celeryTaskId"):
            try:
                celery_app.control.revoke(broadcast["celeryTaskId"], terminate=True)
            except Exception:
                pass

        wa_phone_id = current_user.get("waPhoneNumberId") or settings.WA_PHONE_NUMBER_ID
        wa_token    = current_user.get("waAccessToken")    or settings.WA_ACCESS_TOKEN
        tenant_id   = str(current_user["_id"]) if settings.APP_MODE == "saas" else None

        if wa_phone_id and wa_token:
            task = send_broadcast_task.apply_async(
                kwargs={
                    "broadcast_id": broadcast_id,
                    "wa_phone_id": wa_phone_id,
                    "wa_token": wa_token,
                    "template_name": update_data.get("templateName", broadcast.get("templateName")),
                    "template_lang": update_data.get("templateLanguage", broadcast.get("templateLanguage", "en")),
                    "template_components": update_data.get("templateComponents", broadcast.get("templateComponents")),
                    "header_media_url": update_data.get("headerMediaUrl", broadcast.get("headerMediaUrl")),
                    "header_media_id": update_data.get("headerMediaId", broadcast.get("headerMediaId")),
                    "body_params": update_data.get("bodyParams", broadcast.get("bodyParams")),
                    "carousel_cards": update_data.get("carouselCards", broadcast.get("carouselCards")),
                    "audience_tags": update_data.get("audienceTags", broadcast.get("audienceTags")),
                    "tenant_id": tenant_id,
                    "speed_mps": update_data.get("speedMps", broadcast.get("speedMps")),
                },
                eta=eta_utc
            )
            update_data["celeryTaskId"] = task.id

    await db.db.broadcasts.update_one(broadcast_query, {"$set": update_data})
    
    updated = await db.db.broadcasts.find_one(broadcast_query)
    updated["_id"] = str(updated["_id"])
    return updated


@router.post("/{broadcast_id}/send")
async def send_broadcast(
    broadcast_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Queue a broadcast campaign to Celery for background processing.
    """
    try:
        obj_id = ObjectId(broadcast_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid broadcast ID")

    tenant_filter = get_tenant_filter(current_user)
    broadcast_query = {"_id": obj_id}
    if tenant_filter:
        broadcast_query = {"$and": [broadcast_query, tenant_filter]}

    broadcast = await db.db.broadcasts.find_one(broadcast_query)
    if not broadcast:
        raise HTTPException(status_code=404, detail="Broadcast not found")

    if broadcast.get("status") not in ("draft", "scheduled", "failed", "partial"):
        raise HTTPException(
            status_code=400,
            detail="Broadcast has already been sent or is currently sending",
        )

    wa_phone_id = current_user.get("waPhoneNumberId") or settings.WA_PHONE_NUMBER_ID
    wa_token    = current_user.get("waAccessToken")    or settings.WA_ACCESS_TOKEN

    if not wa_phone_id or not wa_token:
        raise HTTPException(
            status_code=400,
            detail="WhatsApp credentials not configured. Go to Settings.",
        )

    # Count target customers
    audience_tags  = broadcast.get("audienceTags", [])
    csv_audience = broadcast.get("csvAudience")
    
    if broadcast.get("audienceType") == "csv":
        csv_count = broadcast.get("totalCsvRecipients", 0)
        if not csv_count and csv_audience:
            csv_count = len(csv_audience)
        if not csv_count:
            res = await db.db.broadcast_audiences.aggregate([
                {"$match": {"broadcastId": broadcast_id}},
                {"$project": {"count": {"$size": "$recipients"}}},
                {"$group": {"_id": None, "total": {"$sum": "$count"}}}
            ]).to_list(1)
            csv_count = res[0]["total"] if res else 0
        total_count = csv_count
    else:
        customer_query = {"tags": {"$in": audience_tags}} if audience_tags else {}
        if tenant_filter:
            customer_query = {"$and": [customer_query, tenant_filter]}
        total_count = await db.db.customers.count_documents(customer_query)

    if total_count == 0:
        raise HTTPException(
            status_code=400,
            detail="No customers found for the selected audience",
        )

    header_media_url = broadcast.get("headerMediaUrl")
    header_media_id = broadcast.get("headerMediaId")

    if header_media_url and ("localhost" in header_media_url or "/uploads/" in header_media_url):
        filename = header_media_url.split("/")[-1].split("?")[0]
        local_path = os.path.join("uploads", "media", filename)
        
        if os.path.exists(local_path):
            file_type, _ = mimetypes.guess_type(local_path)
            file_type = file_type or "image/jpeg"
            
            try:
                with open(local_path, "rb") as f:
                    file_bytes = f.read()
                
                file_bytes, filename, file_type = compress_image_bytes(file_bytes, filename, file_type)
                
                upload_url = f"https://graph.facebook.com/{settings.WA_API_VERSION}/{wa_phone_id}/media"
                upload_files = {
                    "file": (filename, file_bytes, file_type)
                }
                upload_data = {
                    "messaging_product": "whatsapp"
                }
                upload_headers = {
                    "Authorization": f"Bearer {wa_token}"
                }
                u_client = get_http_client()
                u_resp = await u_client.post(upload_url, headers=upload_headers, data=upload_data, files=upload_files)
                if u_resp.status_code in (200, 201):
                    header_media_id = u_resp.json().get("id")
                    header_media_url = None
                    await db.db.broadcasts.update_one(
                        broadcast_query,
                        {"$set": {
                            "headerMediaId": header_media_id,
                            "headerMediaUrl": None
                        }}
                    )
                else:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Failed to auto-upload template media to WhatsApp API: {u_resp.text}"
                    )
            except Exception as e:
                if isinstance(e, HTTPException):
                    raise e
                raise HTTPException(
                    status_code=500,
                    detail=f"Error uploading media file: {str(e)}"
                )

    scheduled_at = broadcast.get("scheduledAt")
    eta_utc = _get_scheduled_eta(scheduled_at)
    now = _now()
    tenant_id = str(current_user["_id"]) if settings.APP_MODE == "saas" else None

    if eta_utc and eta_utc > now:
        if broadcast.get("celeryTaskId"):
            try:
                celery_app.control.revoke(broadcast["celeryTaskId"], terminate=True)
            except Exception:
                pass

        task = send_broadcast_task.apply_async(
            kwargs={
                "broadcast_id": broadcast_id,
                "wa_phone_id": wa_phone_id,
                "wa_token": wa_token,
                "template_name": broadcast["templateName"],
                "template_lang": broadcast.get("templateLanguage", "en"),
                "template_components": broadcast.get("templateComponents"),
                "header_media_url": header_media_url,
                "header_media_id": header_media_id,
                "body_params": broadcast.get("bodyParams"),
                "carousel_cards": broadcast.get("carouselCards"),
                "audience_tags": audience_tags,
                "tenant_id": tenant_id,
                "csv_audience": csv_audience,
            },
            eta=eta_utc
        )

        await db.db.broadcasts.update_one(
            broadcast_query,
            {"$set": {
                "status": "scheduled",
                "stats.total": total_count,
                "celeryTaskId": task.id,
                "updatedAt": now,
            }},
        )

        return {
            "message": f"Broadcast scheduled successfully for {scheduled_at}.",
            "total": total_count,
            "status": "scheduled",
            "taskId": task.id,
        }

    else:
        # Immediate send
        await db.db.broadcasts.update_one(
            broadcast_query,
            {"$set": {
                "status": "sending",
                "stats.total": total_count,
                "stats.sent": 0,
                "stats.failed": 0,
                "updatedAt": now,
            }},
        )

        task = send_broadcast_task.delay(
            broadcast_id=broadcast_id,
            wa_phone_id=wa_phone_id,
            wa_token=wa_token,
            template_name=broadcast["templateName"],
            template_lang=broadcast.get("templateLanguage", "en"),
            template_components=broadcast.get("templateComponents"),
            header_media_url=header_media_url,
            header_media_id=header_media_id,
            body_params=broadcast.get("bodyParams"),
            carousel_cards=broadcast.get("carouselCards"),
            audience_tags=audience_tags,
            tenant_id=tenant_id,
            csv_audience=csv_audience,
        )

        return {
            "message": f"Broadcast queued. Sending to {total_count} customers.",
            "total": total_count,
            "status": "sending",
            "taskId": task.id,
        }


@router.get("/{broadcast_id}/progress")
async def get_broadcast_progress(broadcast_id: str, current_user: dict = Depends(get_current_user)):
    """Get real-time progress of a broadcast (polling fallback)."""
    try:
        obj_id = ObjectId(broadcast_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid broadcast ID")

    tenant_filter = get_tenant_filter(current_user)
    broadcast_query = {"_id": obj_id}
    if tenant_filter:
        broadcast_query = {"$and": [broadcast_query, tenant_filter]}

    broadcast = await db.db.broadcasts.find_one(broadcast_query)
    if not broadcast:
        raise HTTPException(status_code=404, detail="Broadcast not found")

    stats = broadcast.get("stats", {})
    total = stats.get("total", 0)
    sent = stats.get("sent", 0)
    failed = stats.get("failed", 0)

    return {
        "broadcastId": broadcast_id,
        "status": broadcast.get("status", "unknown"),
        "sent": sent,
        "failed": failed,
        "total": total,
        "percentage": round((sent + failed) / total * 100, 1) if total > 0 else 0,
    }


class RetryRequest(BaseModel):
    retry_mode: Optional[str] = "temporary_only"  # "temporary_only", "frequency_capped", "all_failed"


@router.get("/{broadcast_id}/details")
async def get_broadcast_details(broadcast_id: str, current_user: dict = Depends(get_current_user)):
    """Get complete analytics summary for a broadcast campaign."""
    try:
        obj_id = ObjectId(broadcast_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid broadcast ID")

    tenant_filter = get_tenant_filter(current_user)
    broadcast_query = {"_id": obj_id}
    if tenant_filter:
        broadcast_query = {"$and": [broadcast_query, tenant_filter]}

    broadcast = await db.db.broadcasts.find_one(broadcast_query)
    if not broadcast:
        raise HTTPException(status_code=404, detail="Broadcast not found")

    broadcast["_id"] = str(broadcast["_id"])

    # Auto-sync any 'sent' recipients whose underlying message in messages collection has updated to 'delivered' or 'read'
    sent_recs = await db.db.broadcast_recipients.find({"broadcastId": broadcast_id, "status": "sent"}).to_list(100)
    for r in sent_recs:
        wa_id = r.get("whatsappMessageId")
        phone = r.get("customerPhone")
        msg = None
        if wa_id:
            msg = await db.db.messages.find_one({"whatsappMessageId": wa_id})
        if not msg and phone:
            msg = await db.db.messages.find_one({"customerPhone": phone, "direction": "outbound", "status": {"$in": ["delivered", "read"]}})
        if msg and msg.get("status") in ["delivered", "read"]:
            await db.db.broadcast_recipients.update_one({"_id": r["_id"]}, {"$set": {"status": msg["status"], "updatedAt": _now()}})

    # Aggregate recipient status counts
    pipeline = [
        {"$match": {"broadcastId": broadcast_id}},
        {
            "$group": {
                "_id": "$status",
                "count": {"$sum": 1},
            }
        }
    ]
    status_counts_cursor = db.db.broadcast_recipients.aggregate(pipeline)
    counts = {doc["_id"]: doc["count"] async for doc in status_counts_cursor}

    # Count failure breakdowns
    failed_perm = await db.db.broadcast_recipients.count_documents({"broadcastId": broadcast_id, "status": "failed", "isRetryable": False})
    failed_temp = await db.db.broadcast_recipients.count_documents({"broadcastId": broadcast_id, "status": "failed", "isRetryable": True})
    freq_capped = await db.db.broadcast_recipients.count_documents({"broadcastId": broadcast_id, "status": "frequency_capped"})

    # Exclusive status counts (exact current state of each recipient)
    sent_pending = counts.get("sent", 0)
    delivered_unread = counts.get("delivered", 0)
    read = counts.get("read", 0)
    total_dispatched = sent_pending + delivered_unread + read
    total_processed = sum(counts.values())
    target_total = broadcast.get("stats", {}).get("total", 0) or total_processed

    total_delivered = delivered_unread + read
    delivery_rate = round((total_delivered / total_dispatched * 100), 1) if total_dispatched > 0 else 0
    read_rate = round((read / total_delivered * 100), 1) if total_delivered > 0 else 0

    return {
        "broadcast": broadcast,
        "analytics": {
            "total": target_total,
            "totalProcessed": total_processed,
            "totalDispatched": total_dispatched,
            "sent": sent_pending,
            "delivered": delivered_unread,
            "read": read,
            "failedPermanent": failed_perm,
            "failedTemporary": failed_temp,
            "frequencyCapped": freq_capped,
            "deliveryRate": delivery_rate,
            "readRate": read_rate,
            "counts": counts,
        }
    }


@router.get("/{broadcast_id}/recipients")
async def get_broadcast_recipients(
    broadcast_id: str,
    page: int = 1,
    limit: int = 50,
    status: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get paginated list of recipients for a specific broadcast."""
    try:
        obj_id = ObjectId(broadcast_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid broadcast ID")

    query: dict = {"broadcastId": broadcast_id}

    if status and status != "all":
        if status == "failed_permanent":
            query["status"] = "failed"
            query["isRetryable"] = False
        elif status == "failed_temporary":
            query["status"] = "failed"
            query["isRetryable"] = True
        elif status == "frequency_capped":
            query["status"] = "frequency_capped"
        else:
            query["status"] = status

    if search:
        query["$or"] = [
            {"customerName": {"$regex": search, "$options": "i"}},
            {"customerPhone": {"$regex": search, "$options": "i"}},
        ]

    skip = (page - 1) * limit
    total = await db.db.broadcast_recipients.count_documents(query)
    cursor = db.db.broadcast_recipients.find(query).sort("updatedAt", -1).skip(skip).limit(limit)
    recipients = await cursor.to_list(length=limit)

    for r in recipients:
        r["_id"] = str(r["_id"])
        phone = r.get("customerPhone", "")
        name = r.get("customerName", "")
        if not name or name == phone:
            resolved_name = None
            conv = await db.db.conversations.find_one({"customerPhone": phone})
            if conv and conv.get("customerName") and conv["customerName"] != phone:
                resolved_name = conv["customerName"]
            else:
                cust = await db.db.customers.find_one({"phone": phone})
                if cust and cust.get("name") and cust["name"] != phone:
                    resolved_name = cust["name"]

            if resolved_name:
                r["customerName"] = resolved_name
                await db.db.broadcast_recipients.update_one({"_id": ObjectId(r["_id"])}, {"$set": {"customerName": resolved_name}})

    return {
        "recipients": recipients,
        "total": total,
        "page": page,
        "limit": limit,
        "has_more": (skip + len(recipients)) < total,
    }


@router.post("/{broadcast_id}/retry")
async def retry_broadcast_failed_recipients(
    broadcast_id: str,
    req: Optional[RetryRequest] = None,
    current_user: dict = Depends(get_current_user)
):
    """Resend campaign messages to failed or frequency-capped recipients."""
    try:
        obj_id = ObjectId(broadcast_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid broadcast ID")

    tenant_filter = get_tenant_filter(current_user)
    broadcast_query = {"_id": obj_id}
    if tenant_filter:
        broadcast_query = {"$and": [broadcast_query, tenant_filter]}

    broadcast = await db.db.broadcasts.find_one(broadcast_query)
    if not broadcast:
        raise HTTPException(status_code=404, detail="Broadcast not found")

    if broadcast.get("isPaused"):
        raise HTTPException(status_code=400, detail="Campaign is paused. Resume campaign first to trigger retries.")

    retry_mode = req.retry_mode if req else "temporary_only"

    # Build recipient query for retry
    rec_query: dict = {"broadcastId": broadcast_id, "isPaused": {"$ne": True}}
    if retry_mode == "frequency_capped":
        rec_query["status"] = "frequency_capped"
    elif retry_mode == "temporary_only":
        rec_query["$or"] = [
            {"status": "frequency_capped"},
            {"status": "failed", "isRetryable": True}
        ]
    elif retry_mode == "all_failed":
        rec_query["status"] = {"$in": ["failed", "frequency_capped"]}

    target_recipients = await db.db.broadcast_recipients.find(rec_query).to_list(length=5000)
    if not target_recipients:
        return {"message": "No eligible failed recipients found to retry.", "retryCount": 0}

    target_phones = [r["customerPhone"] for r in target_recipients]

    wa_phone_id = current_user.get("waPhoneNumberId") or settings.WA_PHONE_NUMBER_ID
    wa_token = current_user.get("waAccessToken") or settings.WA_ACCESS_TOKEN
    tenant_id = str(current_user["_id"]) if settings.APP_MODE == "saas" else None

    # Trigger Celery retry task
    task = send_broadcast_task.delay(
        broadcast_id=broadcast_id,
        wa_phone_id=wa_phone_id,
        wa_token=wa_token,
        template_name=broadcast["templateName"],
        template_lang=broadcast.get("templateLanguage", "en"),
        template_components=broadcast.get("templateComponents"),
        header_media_url=broadcast.get("headerMediaUrl"),
        header_media_id=broadcast.get("headerMediaId"),
        body_params=broadcast.get("bodyParams"),
        carousel_cards=broadcast.get("carouselCards"),
        audience_tags=None,
        tenant_id=tenant_id
    )

    return {
        "message": f"Retry started for {len(target_phones)} recipients.",
        "retryCount": len(target_phones),
        "taskId": task.id,
    }


@router.post("/{broadcast_id}/pause")
async def pause_broadcast(broadcast_id: str, current_user: dict = Depends(get_current_user)):
    """Pause automatic retries and ongoing dispatches for a campaign."""
    try:
        obj_id = ObjectId(broadcast_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid broadcast ID")

    result = await db.db.broadcasts.update_one(
        {"_id": obj_id},
        {"$set": {"isPaused": True, "status": "paused", "updatedAt": _now()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Broadcast not found")

    return {"message": "Campaign paused successfully", "isPaused": True}


@router.post("/{broadcast_id}/resume")
async def resume_broadcast(broadcast_id: str, current_user: dict = Depends(get_current_user)):
    """Resume automatic retries and dispatches for a paused campaign."""
    try:
        obj_id = ObjectId(broadcast_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid broadcast ID")

    result = await db.db.broadcasts.update_one(
        {"_id": obj_id},
        {"$set": {"isPaused": False, "status": "running", "updatedAt": _now()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Broadcast not found")

    return {"message": "Campaign resumed successfully", "isPaused": False}


@router.post("/{broadcast_id}/recipients/{recipient_id}/pause")
async def pause_recipient_retry(broadcast_id: str, recipient_id: str, current_user: dict = Depends(get_current_user)):
    """Pause retries for a specific recipient."""
    try:
        obj_id = ObjectId(recipient_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid recipient ID")

    result = await db.db.broadcast_recipients.update_one(
        {"_id": obj_id, "broadcastId": broadcast_id},
        {"$set": {"isPaused": True, "updatedAt": _now()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Recipient not found")

    return {"message": "Recipient paused from retries", "isPaused": True}


@router.post("/{broadcast_id}/recipients/{recipient_id}/resume")
async def resume_recipient_retry(broadcast_id: str, recipient_id: str, current_user: dict = Depends(get_current_user)):
    """Resume retries for a specific recipient."""
    try:
        obj_id = ObjectId(recipient_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid recipient ID")

    result = await db.db.broadcast_recipients.update_one(
        {"_id": obj_id, "broadcastId": broadcast_id},
        {"$set": {"isPaused": False, "updatedAt": _now()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Recipient not found")

    return {"message": "Recipient resumed for retries", "isPaused": False}


@router.get("/{broadcast_id}/export-recipients-csv")
async def export_broadcast_recipients_csv(
    broadcast_id: str,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Stream full CSV export of ALL recipients for a broadcast campaign without page limits.
    """
    try:
        obj_id = ObjectId(broadcast_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid broadcast ID")

    query: dict = {"broadcastId": broadcast_id}
    if status and status != "all":
        if status == "failed_permanent":
            query["status"] = "failed"
            query["isRetryable"] = False
        elif status == "failed_temporary":
            query["status"] = "failed"
            query["isRetryable"] = True
        elif status == "frequency_capped":
            query["status"] = "frequency_capped"
        else:
            query["status"] = status

    async def generate_csv():
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Customer Name", "Phone Number", "Status", "Error Code", "Error Reason", "Retryable", "Paused", "Last Attempt"])
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)

        cursor = db.db.broadcast_recipients.find(query).sort("updatedAt", -1)
        async for r in cursor:
            name = r.get("customerName") or r.get("customerPhone") or ""
            phone = r.get("customerPhone", "")
            st = r.get("status", "")
            err_code = str(r.get("errorCode") or "")
            err_reason = str(r.get("errorReason") or "")
            retryable = "Yes" if r.get("isRetryable") else "No"
            paused = "Yes" if r.get("isPaused") else "No"
            attempt_at = r.get("lastAttemptAt")
            if hasattr(attempt_at, "strftime"):
                attempt_str = attempt_at.strftime("%Y-%m-%d %H:%M:%S")
            else:
                attempt_str = str(attempt_at or "")

            writer.writerow([name, phone, st, err_code, err_reason, retryable, paused, attempt_str])
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

    filename = f"campaign_{broadcast_id}_all_recipients.csv"
    return StreamingResponse(
        generate_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

