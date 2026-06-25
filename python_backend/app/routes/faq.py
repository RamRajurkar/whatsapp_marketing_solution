from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from app.routes.auth import get_current_user
from app.database import db
from bson import ObjectId
from datetime import datetime

router = APIRouter()

class FAQItemCreate(BaseModel):
    keywords: List[str]
    answer: str
    isActive: bool = True

class FAQItemUpdate(BaseModel):
    keywords: Optional[List[str]] = None
    answer: Optional[str] = None
    isActive: Optional[bool] = None

@router.get("/")
async def get_faqs(current_user: dict = Depends(get_current_user)):
    """Get all FAQ items."""
    faqs = []
    cursor = db.db.faq_items.find().sort("createdAt", -1)
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
    doc["createdAt"] = datetime.utcnow()
    doc["updatedAt"] = datetime.utcnow()
    
    # Normalize keywords to lowercase
    doc["keywords"] = [k.lower().strip() for k in doc["keywords"] if k.strip()]
    
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
    update_data = data.model_dump(exclude_unset=True)
    update_data["updatedAt"] = datetime.utcnow()
    
    if "keywords" in update_data:
        update_data["keywords"] = [k.lower().strip() for k in update_data["keywords"] if k.strip()]

    result = await db.db.faq_items.update_one(
        {"_id": ObjectId(faq_id)},
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
    result = await db.db.faq_items.delete_one({"_id": ObjectId(faq_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="FAQ not found")
    return {"message": "FAQ deleted"}
