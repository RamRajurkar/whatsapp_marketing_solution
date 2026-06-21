from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, List
from pydantic import BaseModel
from app.routes.auth import get_current_user
from app.database import db
from app.config import settings
from bson import ObjectId
from datetime import datetime, timezone

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
    templateComponents: Optional[List[dict]] = None  # Template component definitions
    headerMediaUrl: Optional[str] = None
    headerMediaId: Optional[str] = None
    bodyParams: Optional[List[str]] = None
    carouselCards: Optional[List[dict]] = None


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


@router.put("/{broadcast_id}")
async def update_broadcast(broadcast_id: str, data: BroadcastCreate, current_user: dict = Depends(get_current_user)):
    """Update an existing broadcast campaign."""
    try:
        obj_id = ObjectId(broadcast_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid broadcast ID")

    broadcast = await db.db.broadcasts.find_one({"_id": obj_id})
    if not broadcast:
        raise HTTPException(status_code=404, detail="Broadcast not found")
        
    if broadcast.get("status") not in ("draft", "scheduled"):
        raise HTTPException(status_code=400, detail="Only draft or scheduled broadcasts can be edited")

    update_data = data.model_dump(exclude_unset=True)
    update_data["updatedAt"] = _now()
    
    await db.db.broadcasts.update_one({"_id": obj_id}, {"$set": update_data})
    
    updated = await db.db.broadcasts.find_one({"_id": obj_id})
    updated["_id"] = str(updated["_id"])
    return updated


@router.post("/{broadcast_id}/send")
async def send_broadcast(
    broadcast_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Queue a broadcast campaign to Celery for background processing.
    Returns immediately — the actual sending runs in a Celery worker
    so the HTTP request doesn't block and survives server restarts.
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

    # Count target customers for immediate UI feedback
    audience_tags  = broadcast.get("audienceTags", [])
    customer_query = {"tags": {"$in": audience_tags}} if audience_tags else {}
    total_count    = await db.db.customers.count_documents(customer_query)

    if total_count == 0:
        raise HTTPException(
            status_code=400,
            detail="No customers found for the selected audience",
        )

    # Mark as "sending" immediately for UI
    await db.db.broadcasts.update_one(
        {"_id": obj_id},
        {"$set": {
            "status":      "sending",
            "stats.total": total_count,
            "stats.sent":  0,
            "stats.failed": 0,
            "updatedAt":   _now(),
        }},
    )

    # Dispatch to Celery worker
    from app.tasks.broadcast_task import send_broadcast as send_broadcast_task
    
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
        audience_tags=audience_tags,
    )

    return {
        "message": f"Broadcast queued. Sending to {total_count} customers via Celery worker.",
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

    broadcast = await db.db.broadcasts.find_one({"_id": obj_id})
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
