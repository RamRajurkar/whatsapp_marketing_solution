from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from pydantic import BaseModel
from app.routes.auth import get_current_user
from app.database import db
from app.utils.phone import normalize_indian_phone
from bson import ObjectId
from datetime import datetime, timezone
from app.repositories.base import TenantScopedRepository
from app.utils.channel_guard import require_channel

def _now():
    return datetime.now(timezone.utc)

router = APIRouter(dependencies=[Depends(require_channel("whatsapp"))])

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

def _get_cust_repo(current_user: dict):
    tenant_id = current_user.get("tenantId")
    return (
        TenantScopedRepository(db.db.customers, tenant_id),
        TenantScopedRepository(db.db.conversations, tenant_id),
    )

@router.get("")
@router.get("/")
async def get_customers(
    search: str = Query(""), 
    limit: int = Query(100),
    current_user: dict = Depends(get_current_user)
):
    cust_repo, _ = _get_cust_repo(current_user)
    query = {}
    if search:
        query = {
            "$or": [
                {"name": {"$regex": search, "$options": "i"}},
                {"phone": {"$regex": search, "$options": "i"}}
            ]
        }

    customers = await cust_repo.find(query, sort=[("lastSeen", -1)], limit=limit)
    total = await cust_repo.count_documents(query)

    for c in customers:
        c["_id"] = str(c["_id"])
        
    return {"customers": customers, "total": total}

@router.post("")
@router.post("/")
async def create_customer(customer: CustomerCreate, current_user: dict = Depends(get_current_user)):
    cust_repo, _ = _get_cust_repo(current_user)
    # Normalize phone number to 91XXXXXXXXXX format
    try:
        normalized_phone = normalize_indian_phone(customer.phone)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Check if phone already exists for this tenant
    existing = await cust_repo.find_one({"phone": normalized_phone})
    if existing:
        raise HTTPException(status_code=400, detail="Customer with this phone number already exists")
        
    new_customer = customer.model_dump()
    new_customer["phone"] = normalized_phone
    new_customer["waId"] = normalized_phone
    new_customer["createdAt"] = _now()
    new_customer["updatedAt"] = _now()
    new_customer["lastSeen"] = None
    
    result = await cust_repo.insert_one(new_customer)
    new_customer["_id"] = str(result.inserted_id)
    
    return {"message": "Customer created successfully", "customer": new_customer}

@router.patch("/{customer_id}")
async def update_customer(customer_id: str, customer: CustomerUpdate, current_user: dict = Depends(get_current_user)):
    cust_repo, conv_repo = _get_cust_repo(current_user)
    try:
        obj_id = ObjectId(customer_id)
    except Exception:
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
    
    existing_customer = await cust_repo.find_one({"_id": obj_id})
    if not existing_customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    await cust_repo.update_one(
        {"_id": obj_id},
        {"$set": update_data}
    )
    
    # Sync name change to conversations so inbox reflects updated name
    customer_phone = update_data.get("phone") or existing_customer.get("phone")
    new_name = update_data.get("name")
    if new_name and customer_phone:
        await conv_repo.update_many(
            {"customerPhone": customer_phone},
            {"$set": {"customerName": new_name}}
        )
        
    return {"message": "Customer updated successfully"}

@router.delete("/{customer_id}")
async def delete_customer(customer_id: str, current_user: dict = Depends(get_current_user)):
    cust_repo, _ = _get_cust_repo(current_user)
    try:
        obj_id = ObjectId(customer_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid customer ID format")
        
    result = await cust_repo.delete_one({"_id": obj_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
        
    return {"message": "Customer deleted successfully"}


class ExternalCustomerSync(BaseModel):
    name: str
    phone: str
    tags: Optional[List[str]] = ["Wholesale Lead"]
    notes: Optional[str] = "Synced from Wholesale/E-commerce Admin Panel"
    source: Optional[str] = "ecommerce_admin"
    tenantId: Optional[str] = None


@router.post("/external-sync")
async def sync_external_customer(req: ExternalCustomerSync, current_user: dict = Depends(get_current_user)):
    """
    Sync endpoint for Wholesale & E-commerce Admin Panel.
    Receives new leads/customers and syncs them to WhatsApp Customers & Inbox Conversations for the calling tenant.
    """
    cust_repo, conv_repo = _get_cust_repo(current_user)
    try:
        normalized_phone = normalize_indian_phone(req.phone)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    now = _now()
    existing = await cust_repo.find_one({"phone": normalized_phone})

    if existing:
        update_doc = {
            "name": req.name,
            "updatedAt": now,
        }
        if req.tags:
            current_tags = set(existing.get("tags", []))
            current_tags.update(req.tags)
            update_doc["tags"] = list(current_tags)
            
        await cust_repo.update_one({"_id": existing["_id"]}, {"$set": update_doc})
        await conv_repo.update_many({"customerPhone": normalized_phone}, {"$set": {"customerName": req.name}})
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
    result = await cust_repo.insert_one(cust_doc)

    conv = await conv_repo.find_one({"customerPhone": normalized_phone})
    if not conv:
        await conv_repo.insert_one({
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
