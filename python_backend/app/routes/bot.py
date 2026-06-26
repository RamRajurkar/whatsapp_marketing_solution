from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.routes.auth import get_current_user
from app.database import db
from app.services.bot_cache import invalidate_cache

router = APIRouter()

class BotSettingsUpdate(BaseModel):
    isActive: bool
    welcomeMessage: str
    addressText: str
    menuUrl: str
    timingsText: str
    openHour: int = 11
    closeHour: int = 23

@router.get("/")
async def get_bot_settings(current_user: dict = Depends(get_current_user)):
    """Get chatbot settings."""
    settings = await db.db.bot_settings.find_one({})
    if not settings:
        # Return defaults if none exist
        return {
            "isActive": False,
            "welcomeMessage": "Welcome to our Restaurant! 🍔 How can we help you today?",
            "addressText": "We are located at 123 Food Street. 📍",
            "menuUrl": "",
            "timingsText": "We are open Monday to Sunday from 10 AM to 11 PM. 🕒",
            "openHour": 11,
            "closeHour": 23
        }
    settings["_id"] = str(settings["_id"])
    return settings

@router.post("/")
async def update_bot_settings(data: BotSettingsUpdate, current_user: dict = Depends(get_current_user)):
    """Update chatbot settings."""
    doc = data.model_dump()
    
    # Update or insert
    await db.db.bot_settings.update_one(
        {},
        {"$set": doc},
        upsert=True
    )
    
    # Invalidate the cache to apply new settings immediately
    invalidate_cache()
    
    return {"message": "Settings updated successfully", "data": doc}
