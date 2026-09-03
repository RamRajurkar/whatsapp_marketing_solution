from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.routes.auth import get_current_user
from app.database import db
from bson import ObjectId
from datetime import datetime, timezone
from app.repositories.base import TenantScopedRepository
from app.utils.channel_guard import require_channel

router = APIRouter(dependencies=[Depends(require_channel("whatsapp"))])

def _now():
    return datetime.now(timezone.utc)

def _get_qr_repo(current_user: dict):
    return TenantScopedRepository(db.db.quick_replies, current_user.get("tenantId"))

class QuickReplyCreate(BaseModel):
    title: str
    body: str
    category: str = "General"

class QuickReplyUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    category: Optional[str] = None

@router.get("")
@router.get("/")
async def list_quick_replies(current_user: dict = Depends(get_current_user)):
    """Retrieve all quick replies for the calling tenant."""
    qr_repo = _get_qr_repo(current_user)
    replies = await qr_repo.find({}, sort=[("createdAt", -1)])
    for doc in replies:
        doc["_id"] = str(doc["_id"])
    return replies

@router.post("/")
async def create_quick_reply(data: QuickReplyCreate, current_user: dict = Depends(get_current_user)):
    """Create a new quick reply."""
    qr_repo = _get_qr_repo(current_user)
    doc = {
        "title": data.title,
        "body": data.body,
        "category": data.category,
        "usageCount": 0,
        "createdAt": _now(),
        "updatedAt": _now(),
    }
    result = await qr_repo.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc

@router.patch("/{reply_id}")
async def update_quick_reply(reply_id: str, data: QuickReplyUpdate, current_user: dict = Depends(get_current_user)):
    """Update an existing quick reply."""
    qr_repo = _get_qr_repo(current_user)
    try:
        obj_id = ObjectId(reply_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid quick reply ID format")

    existing = await qr_repo.find_one({"_id": obj_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Quick reply not found")

    update_fields = {k: v for k, v in data.model_dump().items() if v is not None}
    update_fields["updatedAt"] = _now()

    await qr_repo.update_one(
        {"_id": obj_id},
        {"$set": update_fields}
    )

    updated = await qr_repo.find_one({"_id": obj_id})
    updated["_id"] = str(updated["_id"])
    return updated

@router.delete("/{reply_id}")
async def delete_quick_reply(reply_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a quick reply."""
    qr_repo = _get_qr_repo(current_user)
    try:
        obj_id = ObjectId(reply_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid quick reply ID format")

    result = await qr_repo.delete_one({"_id": obj_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Quick reply not found")
    return {"message": "Quick reply deleted successfully"}

TEXTILE_REPLIES_SEED = [
    {
        "title": "📖 Share Fabric & Apparel Catalog",
        "category": "Catalogs & Samples",
        "body": "Hello! Here is our latest wholesale fabric & apparel catalog featuring our newest seasonal collection. You can browse all designs, GSM specifications, and shade cards here: {catalog_url}. Let us know which design codes you would like to order or inquire about!"
    },
    {
        "title": "🧵 Swatch Card & Sample Book Request",
        "category": "Catalogs & Samples",
        "body": "We offer physical fabric sample swatches and hanger books for bulk buyers! Sample books are available for Rs 500 (100% refundable against your first bulk order). Kindly reply with your business address and GST number to dispatch your swatch card."
    },
    {
        "title": "💰 Wholesale Rates & MOQ Policy",
        "category": "Pricing & MOQ",
        "body": "Our standard Wholesale Minimum Order Quantity (MOQ) is 200 meters per fabric shade or 50 pieces per style code. Bulk tiered pricing discounts are applicable for orders above 1,000 meters / 200 pieces. Would you like a customized quotation?"
    },
    {
        "title": "📊 Wholesale Price List & GST Terms",
        "category": "Pricing & MOQ",
        "body": "Our wholesale prices are quoted ex-factory (+ 5% GST and transport charges extra). Payment terms: 30% advance with order confirmation and balance 70% against LR dispatch copy."
    },
    {
        "title": "🧶 Fabric Quality & GSM Specs",
        "category": "Fabric Specifications",
        "body": "Fabric Technical Specifications:\n• Material: 100% Pure Combed Cotton / Premium Rayon Blend\n• GSM: 180 - 220 GSM\n• Width (Panna): 58 - 60 inches\n• Color Fastness: 100% Guaranteed (Reactive Dyeing)\n• Shrinkage: < 2% (Pre-shrunk)"
    },
    {
        "title": "✂️ Custom Dyeing & Private Labeling (OEM)",
        "category": "Custom Manufacturing",
        "body": "We offer custom Pantone shade dyeing, rotary printing, digital printing, and custom label stitching for private brands! Custom dyeing MOQ is 500 meters per color with a turnaround time of 10-12 working days."
    },
    {
        "title": "🚚 Shipping, Logistics & Dispatch",
        "category": "Order & Shipping",
        "body": "Orders are dispatched via trusted logistics partners (V-Trans, TCI, SafeExpress, or your preferred local transport). Standard dispatch turnaround is 24-48 hours after payment receipt. Lorry Receipt (LR) tracking copy is shared immediately upon dispatch."
    },
    {
        "title": "🏦 Official Bank Account Details",
        "category": "Payment & Terms",
        "body": "Please find our official company bank account details below:\n• Account Name: Rathod Creation\n• Bank: HDFC Bank\n• A/C No: 50200012345678\n• IFSC Code: HDFC0001234\n• UPI ID: rathodcreation@hdfcbank\n\nPlease share the payment transfer screenshot for instant verification."
    },
    {
        "title": "🏷️ Private Branding & Custom Packaging",
        "category": "Custom Manufacturing",
        "body": "We provide full private label packaging solutions including woven main neck labels, wash care tags, barcode stickers, and custom printed poly-bags. Share your brand artwork/tech-pack to get started!"
    },
    {
        "title": "📞 Wholesale Helpline & Assistance",
        "category": "General",
        "body": "Thank you for reaching out to Rathod Creation Wholesale! Our sales team is reviewing your query. You can also reach our direct wholesale desk at +91 98765 43210 for urgent order requests."
    }
]

GENERIC_REPLIES_SEED = [
    {
        "title": "👋 Welcome & Introduction",
        "category": "General",
        "body": "Hello! Welcome to our WhatsApp service desk. How may we assist you today?"
    },
    {
        "title": "🕒 Business Working Hours",
        "category": "General",
        "body": "Our business hours are Monday through Saturday, 9:00 AM to 7:00 PM. Messages received outside these hours will be answered promptly the next business day."
    },
    {
        "title": "📦 Order Status Inquiry",
        "category": "Orders",
        "body": "Thank you for inquiring about your order. Could you please share your Order ID or registered phone number so our team can provide the latest dispatch update?"
    }
]

@router.post("/seed-textile")
async def seed_textile_quick_replies(current_user: dict = Depends(get_current_user)):
    """Clear old quick replies and seed fresh Textile Industry templates for the calling tenant."""
    qr_repo = _get_qr_repo(current_user)
    
    # 1. Clear old replies for this tenant
    await qr_repo.delete_many({})
    
    # 2. Insert textile templates
    inserted_docs = []
    for item in TEXTILE_REPLIES_SEED:
        doc = {
            "title": item["title"],
            "body": item["body"],
            "category": item["category"],
            "usageCount": 0,
            "createdAt": _now(),
            "updatedAt": _now()
        }
        res = await qr_repo.insert_one(doc)
        doc["_id"] = str(res.inserted_id)
        inserted_docs.append(doc)
        
    return {"message": "Textile templates seeded successfully", "count": len(inserted_docs)}

@router.post("/seed-generic")
async def seed_generic_quick_replies(current_user: dict = Depends(get_current_user)):
    """Seed fresh generic starter templates for the calling tenant."""
    qr_repo = _get_qr_repo(current_user)
    await qr_repo.delete_many({})
    inserted_docs = []
    for item in GENERIC_REPLIES_SEED:
        doc = {
            "title": item["title"],
            "body": item["body"],
            "category": item["category"],
            "usageCount": 0,
            "createdAt": _now(),
            "updatedAt": _now()
        }
        res = await qr_repo.insert_one(doc)
        doc["_id"] = str(res.inserted_id)
        inserted_docs.append(doc)
    return {"message": "Generic templates seeded successfully", "count": len(inserted_docs)}

@router.post("/{reply_id}/use")
async def increment_usage(reply_id: str, current_user: dict = Depends(get_current_user)):
    """Increment the usage counter for a quick reply (called when inserted in inbox)."""
    qr_repo = _get_qr_repo(current_user)
    try:
        obj_id = ObjectId(reply_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid quick reply ID format")

    result = await qr_repo.update_one(
        {"_id": obj_id},
        {"$inc": {"usageCount": 1}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Quick reply not found")
    return {"message": "Usage count incremented"}
