from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from pydantic import BaseModel
from app.routes.auth import get_current_user
from app.database import db

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

@router.get("/")
async def get_settings(current_user: dict = Depends(get_current_user)):
    user_id = current_user["_id"]
    # We will just fetch the current user document as it contains the settings
    user = await db.db.users.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Settings not found")
        
    return {
        "restaurantName": user.get("restaurantName", "My Restaurant"),
        "businessName": user.get("businessName", ""),
        "address": user.get("address", ""),
        "contactNumber": user.get("contactNumber", ""),
        "waPhoneNumberId": user.get("waPhoneNumberId", ""),
        "waBusinessAccountId": user.get("waBusinessAccountId", ""),
        "waAccessToken": user.get("waAccessToken", ""),
        "waVerifyToken": user.get("waVerifyToken", ""),
        "email": user.get("email", "")
    }

@router.patch("/")
async def update_settings(settings: SettingsUpdate, current_user: dict = Depends(get_current_user)):
    user_id = current_user["_id"]
    update_data = {k: v for k, v in settings.model_dump().items() if v is not None}
    
    if not update_data:
        return {"message": "No fields to update"}
        
    result = await db.db.users.update_one(
        {"_id": user_id},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        return {"message": "No changes made"}
        
    return {"message": "Settings updated successfully"}

@router.post("/test-connection")
async def test_connection(current_user: dict = Depends(get_current_user)):
    # This would test the Meta API connection.
    # For now, just return a dummy success to keep the frontend happy until we implement httpx logic.
    user = await db.db.users.find_one({"_id": current_user["_id"]})
    if not user.get("waPhoneNumberId") or not user.get("waAccessToken"):
        raise HTTPException(status_code=400, detail="Missing WhatsApp credentials")
        
    # In a real app we'd make a request to Graph API here
    import httpx
    url = f"https://graph.facebook.com/v19.0/{user.get('waPhoneNumberId')}"
    headers = {"Authorization": f"Bearer {user.get('waAccessToken')}"}
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=headers)
        if response.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Meta API Error: {response.text}")
            
    return {"message": "Connection successful", "phoneInfo": response.json()}
