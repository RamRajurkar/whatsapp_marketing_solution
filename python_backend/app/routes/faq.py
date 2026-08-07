from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from app.routes.auth import get_current_user
from app.database import db
from bson import ObjectId
from datetime import datetime, timezone
from app.utils.tenant import get_tenant_filter, inject_tenant_id

router = APIRouter()

class FAQItemCreate(BaseModel):
    keywords: List[str]
    answer: str
    isActive: bool = True

class FAQItemUpdate(BaseModel):
    keywords: Optional[List[str]] = None
    answer: Optional[str] = None
    isActive: Optional[bool] = None

@router.get("")
@router.get("/")
async def get_faqs(current_user: dict = Depends(get_current_user)):
    """Get all FAQ items."""
    tenant_filter = get_tenant_filter(current_user)
    faqs = []
    cursor = db.db.faq_items.find(tenant_filter).sort("createdAt", -1)
    async for faq in cursor:
        faq["_id"] = str(faq["_id"])
        faqs.append(faq)
    return {"data": faqs}

@router.post("/")
async def create_faq(
    data: FAQItemCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new FAQ item."""
    doc = data.model_dump()
    doc["createdAt"] = datetime.now(timezone.utc)
    doc["updatedAt"] = datetime.now(timezone.utc)
    
    # Normalize keywords to lowercase
    doc["keywords"] = [k.lower().strip() for k in doc["keywords"] if k.strip()]
    inject_tenant_id(doc, current_user)
    
    result = await db.db.faq_items.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return {"message": "FAQ created", "data": doc}

@router.put("/{faq_id}")
async def update_faq(
    faq_id: str,
    data: FAQItemUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an FAQ item."""
    tenant_filter = get_tenant_filter(current_user)
    query = {"_id": ObjectId(faq_id)}
    if tenant_filter:
        query = {"$and": [query, tenant_filter]}

    update_data = data.model_dump(exclude_unset=True)
    update_data["updatedAt"] = datetime.now(timezone.utc)
    
    if "keywords" in update_data:
        update_data["keywords"] = [k.lower().strip() for k in update_data["keywords"] if k.strip()]

    result = await db.db.faq_items.update_one(
        query,
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="FAQ not found")
        
    return {"message": "FAQ updated"}

@router.delete("/{faq_id}")
async def delete_faq(
    faq_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an FAQ item."""
    tenant_filter = get_tenant_filter(current_user)
    query = {"_id": ObjectId(faq_id)}
    if tenant_filter:
        query = {"$and": [query, tenant_filter]}

    result = await db.db.faq_items.delete_one(query)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="FAQ not found")
    return {"message": "FAQ deleted"}
