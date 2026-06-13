from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, List
from pydantic import BaseModel
from app.routes.auth import get_current_user
from app.database import db
from datetime import datetime
from bson import ObjectId
import httpx
from app.socket import sio

router = APIRouter()

class SendMessageRequest(BaseModel):
    text: str

@router.get("/")
async def get_conversations(search: Optional[str] = "", limit: int = 100, current_user: dict = Depends(get_current_user)):
    query = {}
    if search:
        query = {
            "$or": [
                {"customerName": {"$regex": search, "$options": "i"}},
                {"customerPhone": {"$regex": search, "$options": "i"}}
            ]
        }
    
    cursor = db.db.conversations.find(query).sort("lastMessageTime", -1).limit(limit)
    conversations = await cursor.to_list(length=limit)
    
    for conv in conversations:
        conv["_id"] = str(conv["_id"])
        
    return {"conversations": conversations}

@router.get("/{conversation_id}/messages")
async def get_messages(conversation_id: str, current_user: dict = Depends(get_current_user)):
    try:
        # reset unread count when opening a conversation
        await db.db.conversations.update_one(
            {"_id": ObjectId(conversation_id)},
            {"$set": {"unreadCount": 0}}
        )
    except Exception:
        pass

    cursor = db.db.messages.find({"conversationId": conversation_id}).sort("timestamp", 1)
    messages = await cursor.to_list(length=1000)
    
    for msg in messages:
        msg["_id"] = str(msg["_id"])
        
    return {"messages": messages}

@router.post("/{conversation_id}/send-text")
async def send_text(conversation_id: str, req: SendMessageRequest, current_user: dict = Depends(get_current_user)):
    # Fetch admin user for WA credentials
    admin = await db.db.users.find_one({"email": "admin@restaurant.com"})
    if not admin or not admin.get("waPhoneNumberId") or not admin.get("waAccessToken"):
        raise HTTPException(status_code=400, detail="WhatsApp credentials not configured in settings")
        
    conversation = await db.db.conversations.find_one({"_id": ObjectId(conversation_id)})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    customer_phone = conversation["customerPhone"]
    
    # Send via Graph API
    url = f"https://graph.facebook.com/v19.0/{admin['waPhoneNumberId']}/messages"
    headers = {
        "Authorization": f"Bearer {admin['waAccessToken']}",
        "Content-Type": "application/json"
    }
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": customer_phone,
        "type": "text",
        "text": {"preview_url": False, "body": req.text}
    }
    
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json=payload, headers=headers)
        if resp.status_code not in (200, 201):
            raise HTTPException(status_code=400, detail=f"Failed to send message: {resp.text}")
            
        data = resp.json()
        message_id = data.get("messages", [{}])[0].get("id", "unknown")
        
    # Save outbound message
    now = datetime.utcnow()
    message_doc = {
        "conversationId": conversation_id,
        "whatsappMessageId": message_id,
        "direction": "outbound",
        "type": "text",
        "content": {"text": req.text},
        "status": "sent",
        "timestamp": now,
        "createdAt": now
    }
    result = await db.db.messages.insert_one(message_doc)
    message_doc["_id"] = str(result.inserted_id)
    
    # Update conversation
    await db.db.conversations.update_one(
        {"_id": ObjectId(conversation_id)},
        {
            "$set": {
                "lastMessage": req.text,
                "lastMessageTime": now,
                "updatedAt": now
            }
        }
    )
    
    await sio.emit("message:new", message_doc, room=conversation_id)
    await sio.emit("conversation:updated", {"conversationId": conversation_id})
    
    return message_doc
