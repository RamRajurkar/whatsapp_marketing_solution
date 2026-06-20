from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from typing import Optional, List
from pydantic import BaseModel
from app.routes.auth import get_current_user
from app.database import db
from app.config import settings
from bson import ObjectId
from datetime import datetime, timezone
import httpx
import asyncio

router = APIRouter()


def _now():
    return datetime.now(timezone.utc)


class BroadcastCreate(BaseModel):
    name: str
    templateName: str
    templateLanguage: str = "en"
    audienceTags: Optional[List[str]] = []
    scheduledAt: Optional[str] = None
    status: str = "draft"


@router.get("/")
async def get_broadcasts(current_user: dict = Depends(get_current_user)):
    """Get all broadcast campaigns."""
    cursor = db.db.broadcasts.find().sort("createdAt", -1)
    broadcasts = await cursor.to_list(length=100)
    for b in broadcasts:
        b["_id"] = str(b["_id"])
    return broadcasts


@router.post("/")
async def create_broadcast(data: BroadcastCreate, current_user: dict = Depends(get_current_user)):
    """Create a new broadcast campaign."""
    doc = data.model_dump()
    doc["createdAt"] = _now()
    doc["updatedAt"] = _now()
    doc["stats"] = {"total": 0, "sent": 0, "failed": 0}

    result = await db.db.broadcasts.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


@router.delete("/{broadcast_id}")
async def delete_broadcast(broadcast_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a broadcast campaign."""
    try:
        obj_id = ObjectId(broadcast_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid broadcast ID")

    result = await db.db.broadcasts.delete_one({"_id": obj_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    return {"message": "Broadcast deleted"}


@router.post("/{broadcast_id}/send")
async def send_broadcast(
    broadcast_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """
    Queue a broadcast campaign to send in the background.
    Returns immediately — the actual sending runs as a background task
    so the HTTP request doesn't time out for large audiences.
    """
    try:
        obj_id = ObjectId(broadcast_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid broadcast ID")

    broadcast = await db.db.broadcasts.find_one({"_id": obj_id})
    if not broadcast:
        raise HTTPException(status_code=404, detail="Broadcast not found")

    if broadcast.get("status") not in ("draft", "failed", "partial"):
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

    # Get target customers
    audience_tags  = broadcast.get("audienceTags", [])
    customer_query = {"tags": {"$in": audience_tags}} if audience_tags else {}
    customers      = await db.db.customers.find(customer_query).to_list(length=10000)

    if not customers:
        raise HTTPException(
            status_code=400,
            detail="No customers found for the selected audience",
        )

    # Mark as queued immediately so the UI updates
    await db.db.broadcasts.update_one(
        {"_id": obj_id},
        {"$set": {
            "status":      "sending",
            "stats.total": len(customers),
            "updatedAt":   _now(),
        }},
    )

    # Kick off the actual sending in the background — won't block the response
    background_tasks.add_task(
        _do_send_broadcast,
        broadcast_id=broadcast_id,
        obj_id=obj_id,
        customers=customers,
        template_name=broadcast["templateName"],
        template_lang=broadcast.get("templateLanguage", "en"),
        wa_phone_id=wa_phone_id,
        wa_token=wa_token,
    )

    return {
        "message": f"Broadcast queued. Sending to {len(customers)} customers in background.",
        "total": len(customers),
        "status": "sending",
    }


async def _do_send_broadcast(
    broadcast_id: str,
    obj_id: ObjectId,
    customers: list,
    template_name: str,
    template_lang: str,
    wa_phone_id: str,
    wa_token: str,
):
    """Background task: send template messages to all target customers."""
    sent_count   = 0
    failed_count = 0

    if wa_token == "test_token":
        # ── Mock mode ─────────────────────────────────────────────────────────
        for customer in customers:
            phone = customer.get("phone", "")
            if not phone:
                failed_count += 1
                continue
            sent_count += 1
            wa_msg_id = f"mock_bc_{int(_now().timestamp())}_{sent_count}"
            await _save_outbound_template_message(customer, wa_msg_id, template_name, broadcast_id)
            await asyncio.sleep(0.05)
    else:
        # ── Real API ──────────────────────────────────────────────────────────
        async with httpx.AsyncClient(timeout=30.0) as client:
            for customer in customers:
                phone = customer.get("phone", "")
                if not phone:
                    failed_count += 1
                    continue

                url     = f"https://graph.facebook.com/v19.0/{wa_phone_id}/messages"
                headers = {
                    "Authorization": f"Bearer {wa_token}",
                    "Content-Type":  "application/json",
                }
                payload = {
                    "messaging_product": "whatsapp",
                    "recipient_type":    "individual",
                    "to":                phone,
                    "type":              "template",
                    "template": {
                        "name":     template_name,
                        "language": {"code": template_lang},
                    },
                }

                try:
                    resp = await client.post(url, json=payload, headers=headers)
                    if resp.status_code in (200, 201):
                        sent_count += 1
                        wa_msg_id = resp.json().get("messages", [{}])[0].get("id", "unknown")
                        await _save_outbound_template_message(
                            customer, wa_msg_id, template_name, broadcast_id
                        )
                    else:
                        failed_count += 1
                        print(f"[Broadcast] Failed to send to {phone}: {resp.text}")
                except Exception as e:
                    failed_count += 1
                    print(f"[Broadcast] Error sending to {phone}: {e}")

                # Small delay to avoid rate limits
                await asyncio.sleep(0.1)

    # Determine final status
    if failed_count == 0:
        final_status = "sent"
    elif sent_count == 0:
        final_status = "failed"
    else:
        final_status = "partial"  # Some succeeded, some failed

    await db.db.broadcasts.update_one(
        {"_id": obj_id},
        {"$set": {
            "status":       final_status,
            "stats.sent":   sent_count,
            "stats.failed": failed_count,
            "sentAt":       _now(),
            "updatedAt":    _now(),
        }},
    )
    print(f"[Broadcast] Done — sent: {sent_count}, failed: {failed_count}, status: {final_status}")


async def _save_outbound_template_message(
    customer: dict, wa_msg_id: str, template_name: str, broadcast_id: str
):
    """Save an outbound template message and create/update the conversation."""
    phone = customer.get("phone", "")
    name  = customer.get("name", phone)
    now   = _now()

    conversation = await db.db.conversations.find_one({"customerPhone": phone})
    if not conversation:
        conv_doc = {
            "customerPhone":   phone,
            "customerName":    name,
            "lastMessage":     f"[Template: {template_name}]",
            "lastMessageTime": now,
            "unreadCount":     0,
            "createdAt":       now,
            "updatedAt":       now,
        }
        result  = await db.db.conversations.insert_one(conv_doc)
        conv_id = str(result.inserted_id)
    else:
        conv_id = str(conversation["_id"])
        await db.db.conversations.update_one(
            {"_id": conversation["_id"]},
            {"$set": {
                "lastMessage":     f"[Template: {template_name}]",
                "lastMessageTime": now,
                "updatedAt":       now,
            }},
        )

    msg_doc = {
        "conversationId":    conv_id,
        "whatsappMessageId": wa_msg_id,
        "direction":         "outbound",
        "type":              "template",
        "content":           {"text": f"[Template: {template_name}]", "templateName": template_name},
        "status":            "sent",
        "broadcastId":       broadcast_id,
        "timestamp":         now,
        "createdAt":         now,
    }
    await db.db.messages.insert_one(msg_doc)
