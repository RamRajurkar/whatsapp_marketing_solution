from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from pydantic import BaseModel
from app.routes.auth import get_current_user
from app.database import db
from app.utils.phone import normalize_indian_phone
from bson import ObjectId
from datetime import datetime, timezone
from app.utils.tenant import get_tenant_filter, inject_tenant_id

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

@router.get("")
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
    
    tenant_filter = get_tenant_filter(current_user)
    if tenant_filter:
        if query:
            query = {"$and": [query, tenant_filter]}
        else:
            query = tenant_filter
            
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
    tenant_filter = get_tenant_filter(current_user)
    exists_query = {"phone": normalized_phone}
    if tenant_filter:
        exists_query = {"$and": [exists_query, tenant_filter]}
        
    existing = await db.db.customers.find_one(exists_query)
    if existing:
        raise HTTPException(status_code=400, detail="Customer with this phone number already exists")
        
    new_customer = customer.model_dump()
    new_customer["phone"] = normalized_phone
    new_customer["waId"] = normalized_phone
    new_customer["createdAt"] = _now()
    new_customer["updatedAt"] = _now()
    new_customer["lastSeen"] = None
    inject_tenant_id(new_customer, current_user)
    
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
    
    tenant_filter = get_tenant_filter(current_user)
    customer_query = {"_id": obj_id}
    if tenant_filter:
        customer_query = {"$and": [customer_query, tenant_filter]}
        
    # Fetch the customer first so we know their phone number for syncing
    existing_customer = await db.db.customers.find_one(customer_query)
    if not existing_customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    await db.db.customers.update_one(
        customer_query,
        {"$set": update_data}
    )
    
    # Sync name change to conversations so inbox reflects updated name
    customer_phone = update_data.get("phone") or existing_customer.get("phone")
    new_name = update_data.get("name")
    if new_name and customer_phone:
        conv_query = {"customerPhone": customer_phone}
        if tenant_filter:
            conv_query = {"$and": [conv_query, tenant_filter]}
        await db.db.conversations.update_many(
            conv_query,
            {"$set": {"customerName": new_name}}
        )
        
    return {"message": "Customer updated successfully"}

@router.delete("/{customer_id}")
async def delete_customer(customer_id: str, current_user: dict = Depends(get_current_user)):
    try:
        obj_id = ObjectId(customer_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid customer ID format")
        
    tenant_filter = get_tenant_filter(current_user)
    delete_query = {"_id": obj_id}
    if tenant_filter:
        delete_query = {"$and": [delete_query, tenant_filter]}
        
    result = await db.db.customers.delete_one(delete_query)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
        
    return {"message": "Customer deleted successfully"}


class ExternalCustomerSync(BaseModel):
    name: str
    phone: str
    tags: Optional[List[str]] = ["Wholesale Lead"]
    notes: Optional[str] = "Synced from Wholesale/E-commerce Admin Panel"
    source: Optional[str] = "ecommerce_admin"


@router.post("/external-sync")
async def sync_external_customer(req: ExternalCustomerSync):
    """
    Public / API-Key sync endpoint for Wholesale & E-commerce Admin Panel.
    Receives new leads/customers and syncs them to WhatsApp Customers & Inbox Conversations.
    """
    try:
        normalized_phone = normalize_indian_phone(req.phone)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    now = _now()
    existing = await db.db.customers.find_one({"phone": normalized_phone})

    if existing:
        update_doc = {
            "name": req.name,
            "updatedAt": now,
        }
        if req.tags:
            current_tags = set(existing.get("tags", []))
            current_tags.update(req.tags)
            update_doc["tags"] = list(current_tags)
            
        await db.db.customers.update_one({"_id": existing["_id"]}, {"$set": update_doc})
        await db.db.conversations.update_many({"customerPhone": normalized_phone}, {"$set": {"customerName": req.name}})
        return {"message": "Customer updated from external sync", "phone": normalized_phone, "name": req.name}

    cust_doc = {
        "name": req.name,
        "phone": normalized_phone,
        "waId": normalized_phone,
        "tags": req.tags or ["Wholesale Lead"],
        "notes": req.notes,
        "lastSeen": now,
        "createdAt": now,
        "updatedAt": now,
    }
    result = await db.db.customers.insert_one(cust_doc)

    conv = await db.db.conversations.find_one({"customerPhone": normalized_phone})
    if not conv:
        await db.db.conversations.insert_one({
            "customerPhone": normalized_phone,
            "customerName": req.name,
            "lastMessage": "[Lead Synced from E-commerce/Wholesale Admin Panel]",
            "lastMessageTime": now,
            "unreadCount": 0,
            "status": "active",
            "createdAt": now,
            "updatedAt": now,
        })

    return {"message": "Customer & conversation created from external sync", "phone": normalized_phone, "id": str(result.inserted_id)}
