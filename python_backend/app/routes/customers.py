from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from pydantic import BaseModel
from app.routes.auth import get_current_user
from app.database import db
from app.utils.phone import normalize_indian_phone
from bson import ObjectId
from datetime import datetime, timezone

def _now():
    return datetime.now(timezone.utc)

router = APIRouter()

class CustomerCreate(BaseModel):
    name: str
    phone: str
    waId: Optional[str] = None
    tags: Optional[List[str]] = []
    notes: Optional[str] = ""

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    waId: Optional[str] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None

@router.get("/")
async def get_customers(
    search: str = Query(""), 
    limit: int = Query(100),
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if search:
        query = {
            "$or": [
                {"name": {"$regex": search, "$options": "i"}},
                {"phone": {"$regex": search, "$options": "i"}}
            ]
        }
    
    cursor = db.db.customers.find(query).sort("lastSeen", -1).limit(limit)
    customers = await cursor.to_list(length=limit)
    total = await db.db.customers.count_documents(query)
    
    # Convert ObjectId to string for JSON serialization
    for c in customers:
        c["_id"] = str(c["_id"])
        
    return {"customers": customers, "total": total}

@router.post("/")
async def create_customer(customer: CustomerCreate, current_user: dict = Depends(get_current_user)):
    # Normalize phone number to 91XXXXXXXXXX format
    try:
        normalized_phone = normalize_indian_phone(customer.phone)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Check if phone already exists
    existing = await db.db.customers.find_one({"phone": normalized_phone})
    if existing:
        raise HTTPException(status_code=400, detail="Customer with this phone number already exists")
        
    new_customer = customer.model_dump()
    new_customer["phone"] = normalized_phone
    new_customer["waId"] = normalized_phone
    new_customer["createdAt"] = _now()
    new_customer["updatedAt"] = _now()
    new_customer["lastSeen"] = None
    
    result = await db.db.customers.insert_one(new_customer)
    new_customer["_id"] = str(result.inserted_id)
    
    return {"message": "Customer created successfully", "customer": new_customer}

@router.patch("/{customer_id}")
async def update_customer(customer_id: str, customer: CustomerUpdate, current_user: dict = Depends(get_current_user)):
    try:
        obj_id = ObjectId(customer_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid customer ID format")
        
    update_data = {k: v for k, v in customer.model_dump().items() if v is not None}
    if not update_data:
        return {"message": "No fields to update"}
    
    # Normalize phone if being updated
    if "phone" in update_data:
        try:
            update_data["phone"] = normalize_indian_phone(update_data["phone"])
            update_data["waId"] = update_data["phone"]
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
    update_data["updatedAt"] = _now()
    
    result = await db.db.customers.update_one(
        {"_id": obj_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
        
    return {"message": "Customer updated successfully"}

@router.delete("/{customer_id}")
async def delete_customer(customer_id: str, current_user: dict = Depends(get_current_user)):
    try:
        obj_id = ObjectId(customer_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid customer ID format")
        
    result = await db.db.customers.delete_one({"_id": obj_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
        
    return {"message": "Customer deleted successfully"}
