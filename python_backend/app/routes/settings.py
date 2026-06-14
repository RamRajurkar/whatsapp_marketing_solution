from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from pydantic import BaseModel
from bson import ObjectId
from app.routes.auth import get_current_user
from app.database import db
from app.config import settings

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
    password: Optional[str] = None

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
        "email": current_user.get("email", "")
    }

@router.patch("/")
async def update_settings(settings_data: SettingsUpdate, current_user: dict = Depends(get_current_user)):
    user_id = current_user["_id"]
    update_data = {k: v for k, v in settings_data.model_dump().items() if v is not None}
    
    if not update_data:
        return {"message": "No fields to update"}
    
    if "password" in update_data:
        from app.utils.auth import get_password_hash
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
    
    if result.modified_count == 0:
        return {"message": "No changes made"}
        
    return {"message": "Settings updated successfully"}

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
    import httpx
    url = f"https://graph.facebook.com/v19.0/{wa_phone_number_id}"
    headers = {"Authorization": f"Bearer {wa_access_token}"}
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=headers)
        if response.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Meta API Error: {response.text}")
            
    return {"message": "Connection successful", "phoneInfo": response.json()}
