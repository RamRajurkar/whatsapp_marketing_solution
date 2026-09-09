from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from typing import Optional, List
from pydantic import BaseModel
from bson import ObjectId
import os
import aiofiles
from app.routes.auth import get_current_user
from app.database import db
from app.config import settings
from app.utils.auth import get_password_hash
from app.http_client import get_http_client
import httpx
import time

router = APIRouter()

class SettingsUpdate(BaseModel):
    restaurantName: Optional[str] = None
    businessName: Optional[str] = None
    address: Optional[str] = None
    contactNumber: Optional[str] = None
    waPhoneNumberId: Optional[str] = None
    waBusinessAccountId: Optional[str] = None
    waAccessToken: Optional[str] = None
    waVerifyToken: Optional[str] = None
    leadsWebhookUrl: Optional[str] = None
    maxMpsLimit: Optional[int] = 25
    dailyTierLimit: Optional[int] = 250
    password: Optional[str] = None

class TestWebhookRequest(BaseModel):
    webhookUrl: str
    inquiryType: Optional[str] = "product_inquiry"

class BrandingUpdate(BaseModel):
    appName: Optional[str] = None
    tagline: Optional[str] = None
    primaryColor: Optional[str] = None
    accentColor: Optional[str] = None
    darkColor: Optional[str] = None
    impactLines: Optional[List[str]] = None
    trustStats: Optional[list] = None

DEFAULT_BRANDING = {
    "appName": "Black Angler",
    "tagline": "Omnichannel Marketing & WhatsApp Business Platform",
    "logoPath": None,
    "loginBgPath": None,
    "primaryColor": "#1B5E37",
    "accentColor": "#2E7D4F",
    "darkColor": "#0d2b1a",
    "impactLines": [
        "Automate customer engagement via WhatsApp",
        "Increase repeat orders by 40% with targeted broadcasts",
        "Manage reservations and orders in real-time",
        "Reduce response time to under 2 minutes"
    ],
    "trustStats": [
        {"number": "10K+", "label": "Messages / Day"},
        {"number": "500+", "label": "Businesses"},
        {"number": "99.9%", "label": "Uptime"}
    ]
}

@router.get("")
@router.get("/")
async def get_settings(current_user: dict = Depends(get_current_user)):
    # current_user already contains all user fields from get_current_user
    return {
        "restaurantName": current_user.get("restaurantName", "My Restaurant"),
        "businessName": current_user.get("businessName", ""),
        "address": current_user.get("address", ""),
        "contactNumber": current_user.get("contactNumber", ""),
        "waPhoneNumberId": current_user.get("waPhoneNumberId") or settings.WA_PHONE_NUMBER_ID or "",
        "waBusinessAccountId": current_user.get("waBusinessAccountId") or settings.WA_BUSINESS_ACCOUNT_ID or "",
        "waAccessToken": current_user.get("waAccessToken") or settings.WA_ACCESS_TOKEN or "",
        "waVerifyToken": current_user.get("waVerifyToken") or settings.WA_VERIFY_TOKEN or "",
        "leadsWebhookUrl": current_user.get("leadsWebhookUrl") or os.getenv("OUTBOUND_LEADS_WEBHOOK_URL", ""),
        "email": current_user.get("email", ""),
        "maxMpsLimit": current_user.get("maxMpsLimit", 25),
        "dailyTierLimit": current_user.get("dailyTierLimit", 250),
    }

@router.post("/test-lead-webhook")
async def test_lead_webhook(req: TestWebhookRequest, current_user: dict = Depends(get_current_user)):
    """Dispatch a mock lead test payload to user's central dashboard webhook URL."""
    from app.services.webhook_dispatcher import dispatch_lead_webhook
    from datetime import datetime, timezone
    
    inq_type = getattr(req, "inquiryType", None) or "product_inquiry"
    mock_lead = {
        "_id": f"simulated_{inq_type}_9999",
        "customerName": "Test Customer (Rathod Creation)",
        "customerPhone": "918625067058",
        "productName": "Silk Designer Saree",
        "styleCode": "RC-SAREE-902",
        "quantityRange": "20+ pieces",
        "requirements": "Sample Test Webhook Payload from WhatsApp Platform",
        "catalogUrl": "http://localhost/menu",
        "issueDescription": "Customer requested assistance",
        "status": "Pending",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "tenantId": str(current_user.get("_id"))
    }
    
    # Dispatch webhook using provided req.webhookUrl
    res = await dispatch_lead_webhook(
        mock_lead, 
        event_type=f"lead.{inq_type}", 
        inquiry_type=inq_type, 
        tenant_id=str(current_user.get("_id")),
        override_webhook_url=req.webhookUrl
    )
    if res and not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "Failed to connect to test webhook URL"))
    return res or {"success": True, "message": f"Test webhook for {inq_type} dispatched"}

@router.patch("")
@router.patch("/")
async def update_settings(settings_data: SettingsUpdate, current_user: dict = Depends(get_current_user)):
    user_id = current_user["_id"]
    update_data = {k: v for k, v in settings_data.model_dump().items() if v is not None}
    
    if not update_data:
        return {"message": "No fields to update"}
    
    if "password" in update_data:
        update_data["password"] = get_password_hash(update_data["password"])
        
    # Convert string _id back to ObjectId for MongoDB query
    try:
        obj_id = ObjectId(user_id)
    except Exception:
        obj_id = user_id
        
    result = await db.db.users.update_one(
        {"_id": obj_id},
        {"$set": update_data}
    )
    
    # In SaaS mode, if WhatsApp credentials were submitted, auto-vault into wa_connections
    if getattr(settings, "APP_MODE", "self_hosted") == "saas" and update_data.get("waPhoneNumberId") and update_data.get("waAccessToken"):
        from app.models.channels.whatsapp import WhatsAppConnection
        tenant_id = str(current_user.get("tenantId") or current_user.get("_id"))
        conn = WhatsAppConnection.create_encrypted(
            tenant_id=tenant_id,
            phone_number_id=update_data["waPhoneNumberId"],
            waba_id=update_data.get("waBusinessAccountId", ""),
            access_token=update_data["waAccessToken"],
            app_secret=update_data.get("waAppSecret"),
            verify_token=update_data.get("waVerifyToken") or settings.WA_VERIFY_TOKEN
        )
        conn_dict = conn.model_dump(by_alias=True, exclude=["id"])
        await db.db.wa_connections.update_one(
            {"tenantId": tenant_id},
            {"$set": conn_dict},
            upsert=True
        )

    return {"message": "Settings updated successfully"}

class WhatsAppConnectRequest(BaseModel):
    phoneNumberId: str
    wabaId: str
    accessToken: str
    appSecret: Optional[str] = None
    verifyToken: Optional[str] = None
    displayPhoneNumber: Optional[str] = None

@router.post("/whatsapp/connect")
async def connect_whatsapp_channel(req: WhatsAppConnectRequest, current_user: dict = Depends(get_current_user)):
    """
    SaaS Tenant Onboarding Endpoint for WhatsApp.
    Encrypts Meta Cloud API credentials with AES-256-GCM and vaults into wa_connections.
    """
    from app.models.channels.whatsapp import WhatsAppConnection
    tenant_id = str(current_user.get("tenantId") or current_user.get("_id"))
    
    conn = WhatsAppConnection.create_encrypted(
        tenant_id=tenant_id,
        phone_number_id=req.phoneNumberId,
        waba_id=req.wabaId,
        access_token=req.accessToken,
        app_secret=req.appSecret,
        verify_token=req.verifyToken or settings.WA_VERIFY_TOKEN,
        display_phone_number=req.displayPhoneNumber
    )
    conn_dict = conn.model_dump(by_alias=True, exclude=["id"])
    
    await db.db.wa_connections.update_one(
        {"tenantId": tenant_id},
        {"$set": conn_dict},
        upsert=True
    )
    
    # Also update user record pointer
    try:
        obj_id = ObjectId(current_user["_id"])
    except Exception:
        obj_id = current_user["_id"]
        
    await db.db.users.update_one(
        {"_id": obj_id},
        {"$set": {
            "waPhoneNumberId": req.phoneNumberId,
            "waBusinessAccountId": req.wabaId
        }}
    )
    
    return {
        "status": "connected",
        "tenantId": tenant_id,
        "phoneNumberId": req.phoneNumberId,
        "wabaId": req.wabaId,
        "vaulted": True,
        "message": "WhatsApp credentials securely encrypted and vaulted for tenant."
    }

@router.get("/whatsapp/status")
async def get_whatsapp_channel_status(current_user: dict = Depends(get_current_user)):
    """Check WhatsApp channel connection status for tenant."""
    tenant_id = str(current_user.get("tenantId") or current_user.get("_id"))
    conn = await db.db.wa_connections.find_one({"tenantId": tenant_id})
    if not conn:
        return {"connected": False, "tenantId": tenant_id}
    
    return {
        "connected": True,
        "tenantId": tenant_id,
        "phoneNumberId": conn.get("phoneNumberId"),
        "wabaId": conn.get("wabaId"),
        "displayPhoneNumber": conn.get("displayPhoneNumber"),
        "status": conn.get("status", "connected"),
        "qualityRating": conn.get("qualityRating", "GREEN")
    }

@router.post("/test-connection")
async def test_connection(current_user: dict = Depends(get_current_user)):
    wa_phone_number_id = current_user.get("waPhoneNumberId") or settings.WA_PHONE_NUMBER_ID
    wa_access_token = current_user.get("waAccessToken") or settings.WA_ACCESS_TOKEN

    if not wa_phone_number_id or not wa_access_token:
        raise HTTPException(status_code=400, detail="Missing WhatsApp credentials")
        
    # Mock mode bypass
    if wa_access_token == "test_token":
        return {
            "message": "Connection successful (Mock Mode)",
            "phoneInfo": {
                "id": wa_phone_number_id,
                "display_phone_number": "+1 (555) 662-6940 (Test)"
            }
        }

    # In a real app we'd make a request to Graph API here
    url = f"https://graph.facebook.com/{settings.WA_API_VERSION}/{wa_phone_number_id}"
    headers = {"Authorization": f"Bearer {wa_access_token}"}
    
    client = get_http_client()
    response = await client.get(url, headers=headers)
    if response.status_code != 200:
        raise HTTPException(status_code=400, detail=f"Meta API Error: {response.text}")
            
    return {"message": "Connection successful", "phoneInfo": response.json()}


@router.get("/branding")
async def get_branding():
    """Public endpoint to get app branding configurations."""
    branding = await db.db.branding.find_one({})
    if not branding:
        # Create default branding if it doesn't exist
        await db.db.branding.insert_one(DEFAULT_BRANDING.copy())
        branding = DEFAULT_BRANDING.copy()
        
    # Remove _id from response
    if "_id" in branding:
        branding["_id"] = str(branding["_id"])
        
    return branding


@router.patch("/branding")
async def update_branding(branding_data: BrandingUpdate, current_user: dict = Depends(get_current_user)):
    update_data = {k: v for k, v in branding_data.model_dump().items() if v is not None}
    
    if not update_data:
        return {"message": "No fields to update"}
        
    # We only have one branding document
    result = await db.db.branding.update_one(
        {}, 
        {"$set": update_data},
        upsert=True
    )
    
    return {"message": "Branding updated successfully"}


@router.post("/upload-branding")
async def upload_branding_image(
    type: str = Form(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    if type not in ["logo", "loginBg"]:
        raise HTTPException(status_code=400, detail="Invalid image type. Must be 'logo' or 'loginBg'")
        
    # Create extension
    ext = file.filename.split(".")[-1] if "." in file.filename else "png"
    filename = f"{type}.{ext}"
    filepath = os.path.join("uploads", "branding", filename)
    
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    
    async with aiofiles.open(filepath, 'wb') as out_file:
        content = await file.read()
        await out_file.write(content)
        
    url_path = f"http://localhost:5000/uploads/branding/{filename}?v={int(time.time())}"
    
    # Update db
    field = "logoPath" if type == "logo" else "loginBgPath"
    await db.db.branding.update_one(
        {},
        {"$set": {field: url_path}},
        upsert=True
    )
    
    return {"message": "Image uploaded successfully", "url": url_path}
