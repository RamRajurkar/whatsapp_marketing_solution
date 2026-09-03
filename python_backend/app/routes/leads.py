"""
Unified Leads CRM API Router.
Scoped via TenantScopedRepository with multi-channel source attribution.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from datetime import datetime, timezone
from bson import ObjectId

from app.routes.auth import get_current_user
from app.database import db
from app.repositories.base import TenantScopedRepository
from app.utils.phone import normalize_indian_phone

router = APIRouter()

def _now():
    return datetime.now(timezone.utc)

def _get_lead_repo(current_user: dict):
    return TenantScopedRepository(db.db.leads, current_user.get("tenantId"))

class LeadCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    sourceChannel: str = "manual"  # "whatsapp", "gbp_review", "gbp_qr", "ecommerce_admin", "manual"
    sourceMetadata: Optional[Dict[str, Any]] = None
    status: str = "new"
    tags: Optional[List[str]] = []
    notes: Optional[str] = ""
    estimatedValue: Optional[float] = 0.0

class LeadUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    status: Optional[str] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None
    estimatedValue: Optional[float] = None
    assignedToUserId: Optional[str] = None

@router.get("")
@router.get("/")
async def get_leads(
    source_channel: Optional[str] = Query(None, description="Filter by source: whatsapp, gbp_review, gbp_qr, manual"),
    status: Optional[str] = Query(None, description="Filter by status: new, contacted, qualified, converted, closed_lost"),
    search: Optional[str] = Query(None),
    limit: int = Query(100, le=200),
    current_user: dict = Depends(get_current_user)
):
    """Retrieve leads for the calling tenant with multi-channel filtering."""
    lead_repo = _get_lead_repo(current_user)
    query: dict = {}

    if source_channel:
        query["sourceChannel"] = source_channel
    if status:
        query["status"] = status
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}}
        ]

    leads = await lead_repo.find(query, sort=[("createdAt", -1)], limit=limit)
    total = await lead_repo.count_documents(query)

    for l in leads:
        l["_id"] = str(l["_id"])

    return {"leads": leads, "total": total}

@router.post("")
@router.post("/")
async def create_lead(lead: LeadCreate, current_user: dict = Depends(get_current_user)):
    """Create a new lead with explicit source channel attribution."""
    lead_repo = _get_lead_repo(current_user)
    tenant_id = current_user.get("tenantId")

    clean_phone = None
    if lead.phone:
        try:
            clean_phone = normalize_indian_phone(lead.phone)
        except Exception:
            clean_phone = lead.phone

    lead_doc = lead.model_dump()
    lead_doc["phone"] = clean_phone
    lead_doc["tenantId"] = tenant_id
    lead_doc["createdAt"] = _now()
    lead_doc["updatedAt"] = _now()

    result = await lead_repo.insert_one(lead_doc)
    lead_doc["_id"] = str(result.inserted_id)

    return {"message": "Lead created successfully", "lead": lead_doc}

@router.patch("/{lead_id}")
async def update_lead(lead_id: str, data: LeadUpdate, current_user: dict = Depends(get_current_user)):
    """Update lead status, pipeline progress, or notes."""
    lead_repo = _get_lead_repo(current_user)
    try:
        obj_id = ObjectId(lead_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid lead ID format")

    update_fields = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_fields:
        return {"message": "No fields to update"}

    update_fields["updatedAt"] = _now()

    result = await lead_repo.update_one(
        {"_id": obj_id},
        {"$set": update_fields}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")

    updated = await lead_repo.find_one({"_id": obj_id})
    updated["_id"] = str(updated["_id"])
    return {"message": "Lead updated successfully", "lead": updated}

@router.delete("/{lead_id}")
async def delete_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a lead."""
    lead_repo = _get_lead_repo(current_user)
    try:
        obj_id = ObjectId(lead_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid lead ID format")

    result = await lead_repo.delete_one({"_id": obj_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"message": "Lead deleted successfully"}

@router.get("/analytics/summary")
async def get_leads_summary(current_user: dict = Depends(get_current_user)):
    """Aggregation breakdown of leads by source_channel and pipeline status."""
    lead_repo = _get_lead_repo(current_user)

    channel_stats = await lead_repo.aggregate([
        {"$group": {"_id": "$sourceChannel", "count": {"$sum": 1}}}
    ])

    status_stats = await lead_repo.aggregate([
        {"$group": {"_id": "$status", "count": {"$sum": 1}, "totalValue": {"$sum": "$estimatedValue"}}}
    ])

    by_channel = {doc["_id"]: doc["count"] for doc in channel_stats}
    by_status = {doc["_id"]: {"count": doc["count"], "value": doc.get("totalValue", 0)} for doc in status_stats}

    return {
        "byChannel": by_channel,
        "byStatus": by_status,
        "totalLeads": sum(by_channel.values())
    }
