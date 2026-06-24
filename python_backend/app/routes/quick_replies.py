"""
Quick Replies CRUD routes.

Quick replies are reusable message snippets that can be quickly inserted
when chatting with customers in the inbox.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.routes.auth import get_current_user
from app.database import db
from bson import ObjectId
from datetime import datetime, timezone

router = APIRouter()


def _now():
    return datetime.now(timezone.utc)


class QuickReplyCreate(BaseModel):
    title: str
    body: str
    category: str = "General"


class QuickReplyUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    category: Optional[str] = None


@router.get("/")
async def list_quick_replies(current_user: dict = Depends(get_current_user)):
    """Retrieve all quick replies, sorted by most recently created."""
    cursor = db.db.quick_replies.find({}).sort("createdAt", -1)
    replies = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        replies.append(doc)
    return replies


@router.post("/")
async def create_quick_reply(data: QuickReplyCreate, current_user: dict = Depends(get_current_user)):
    """Create a new quick reply."""
    doc = {
        "title": data.title,
        "body": data.body,
        "category": data.category,
        "usageCount": 0,
        "createdAt": _now(),
        "updatedAt": _now(),
    }
    result = await db.db.quick_replies.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


@router.patch("/{reply_id}")
async def update_quick_reply(reply_id: str, data: QuickReplyUpdate, current_user: dict = Depends(get_current_user)):
    """Update an existing quick reply."""
    existing = await db.db.quick_replies.find_one({"_id": ObjectId(reply_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Quick reply not found")

    update_fields = {k: v for k, v in data.model_dump().items() if v is not None}
    update_fields["updatedAt"] = _now()

    await db.db.quick_replies.update_one(
        {"_id": ObjectId(reply_id)},
        {"$set": update_fields}
    )

    updated = await db.db.quick_replies.find_one({"_id": ObjectId(reply_id)})
    updated["_id"] = str(updated["_id"])
    return updated


@router.delete("/{reply_id}")
async def delete_quick_reply(reply_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a quick reply."""
    result = await db.db.quick_replies.delete_one({"_id": ObjectId(reply_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Quick reply not found")
    return {"message": "Quick reply deleted successfully"}


@router.post("/{reply_id}/use")
async def increment_usage(reply_id: str, current_user: dict = Depends(get_current_user)):
    """Increment the usage counter for a quick reply (called when inserted in inbox)."""
    result = await db.db.quick_replies.update_one(
        {"_id": ObjectId(reply_id)},
        {"$inc": {"usageCount": 1}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Quick reply not found")
    return {"message": "Usage count incremented"}
