from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, List
from pydantic import BaseModel
from app.routes.auth import get_current_user
from app.database import db
from app.config import settings
from app.socket import sio
from app.utils.phone import normalize_indian_phone
from bson import ObjectId
from datetime import datetime
import httpx

router = APIRouter()


class SendTextRequest(BaseModel):
    phone: str
    text: str


class SendTemplateRequest(BaseModel):
    phone: str
    templateName: str
    templateLanguage: str = "en"


@router.post("/send-text")
async def send_text_direct(req: SendTextRequest, current_user: dict = Depends(get_current_user)):
    """Send a text message directly to any phone number. Auto-creates conversation & customer."""
    wa_phone_id = current_user.get("waPhoneNumberId") or settings.WA_PHONE_NUMBER_ID
    wa_token = current_user.get("waAccessToken") or settings.WA_ACCESS_TOKEN

    if not wa_phone_id or not wa_token:
        raise HTTPException(status_code=400, detail="WhatsApp credentials not configured. Go to Settings.")

    # Normalize Indian phone number
    try:
        phone = normalize_indian_phone(req.phone)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    now = datetime.utcnow()

    # Mock mode
    if wa_token == "test_token":
        wa_msg_id = f"mock_msg_{int(now.timestamp())}"
    else:
        # Send via Graph API
        url = f"https://graph.facebook.com/v19.0/{wa_phone_id}/messages"
        headers = {
            "Authorization": f"Bearer {wa_token}",
            "Content-Type": "application/json"
        }
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "text",
            "text": {"preview_url": False, "body": req.text}
        }
    
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code not in (200, 201):
                raise HTTPException(status_code=400, detail=f"Failed to send: {resp.text}")
            data = resp.json()
            wa_msg_id = data.get("messages", [{}])[0].get("id", "unknown")

    # Auto-create customer if not exists
    customer = await db.db.customers.find_one({"phone": phone})
    customer_name = phone
    if customer:
        customer_name = customer.get("name", phone)
        await db.db.customers.update_one(
            {"_id": customer["_id"]},
            {"$set": {"lastSeen": now, "updatedAt": now}}
        )
    else:
        cust_doc = {
            "name": phone,
            "phone": phone,
            "waId": phone,
            "tags": [],
            "notes": "",
            "lastSeen": now,
            "createdAt": now,
            "updatedAt": now,
        }
        await db.db.customers.insert_one(cust_doc)

    # Find or create conversation
    conversation = await db.db.conversations.find_one({"customerPhone": phone})
    if conversation:
        conv_id = str(conversation["_id"])
        await db.db.conversations.update_one(
            {"_id": conversation["_id"]},
            {"$set": {
                "lastMessage": req.text,
                "lastMessageTime": now,
                "updatedAt": now
            }}
        )
    else:
        conv_doc = {
            "customerPhone": phone,
            "customerName": customer_name,
            "lastMessage": req.text,
            "lastMessageTime": now,
            "unreadCount": 0,
            "createdAt": now,
            "updatedAt": now,
        }
        result = await db.db.conversations.insert_one(conv_doc)
        conv_id = str(result.inserted_id)

    # Save outbound message
    msg_doc = {
        "conversationId": conv_id,
        "whatsappMessageId": wa_msg_id,
        "direction": "outbound",
        "type": "text",
        "content": {"text": req.text},
        "status": "sent",
        "timestamp": now,
        "createdAt": now,
    }
    msg_result = await db.db.messages.insert_one(msg_doc)
    msg_doc["_id"] = str(msg_result.inserted_id)

    # Emit socket events
    emit_doc = {**msg_doc, "timestamp": now.isoformat(), "createdAt": now.isoformat()}
    await sio.emit("message:new", emit_doc, room=conv_id)
    await sio.emit("conversation:updated", {"conversationId": conv_id})

    return {
        "message": "Text sent successfully",
        "conversationId": conv_id,
        "whatsappMessageId": wa_msg_id
    }


@router.post("/send-template")
async def send_template_direct(req: SendTemplateRequest, current_user: dict = Depends(get_current_user)):
    """Send a template message directly to any phone number."""
    wa_phone_id = current_user.get("waPhoneNumberId") or settings.WA_PHONE_NUMBER_ID
    wa_token = current_user.get("waAccessToken") or settings.WA_ACCESS_TOKEN

    if not wa_phone_id or not wa_token:
        raise HTTPException(status_code=400, detail="WhatsApp credentials not configured. Go to Settings.")

    # Normalize Indian phone number
    try:
        phone = normalize_indian_phone(req.phone)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    now = datetime.utcnow()

    # Mock mode
    if wa_token == "test_token":
        wa_msg_id = f"mock_tpl_{int(now.timestamp())}"
    else:
        # Send via Graph API
        url = f"https://graph.facebook.com/v19.0/{wa_phone_id}/messages"
        headers = {
            "Authorization": f"Bearer {wa_token}",
            "Content-Type": "application/json"
        }
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "template",
            "template": {
                "name": req.templateName,
                "language": {"code": req.templateLanguage}
            }
        }
    
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code not in (200, 201):
                raise HTTPException(status_code=400, detail=f"Failed to send template: {resp.text}")
            data = resp.json()
            wa_msg_id = data.get("messages", [{}])[0].get("id", "unknown")

    # Auto-create customer if not exists
    customer = await db.db.customers.find_one({"phone": phone})
    customer_name = phone
    if customer:
        customer_name = customer.get("name", phone)

    # Find or create conversation
    conversation = await db.db.conversations.find_one({"customerPhone": phone})
    if conversation:
        conv_id = str(conversation["_id"])
        await db.db.conversations.update_one(
            {"_id": conversation["_id"]},
            {"$set": {
                "lastMessage": f"[Template: {req.templateName}]",
                "lastMessageTime": now,
                "updatedAt": now
            }}
        )
    else:
        conv_doc = {
            "customerPhone": phone,
            "customerName": customer_name,
            "lastMessage": f"[Template: {req.templateName}]",
            "lastMessageTime": now,
            "unreadCount": 0,
            "createdAt": now,
            "updatedAt": now,
        }
        result = await db.db.conversations.insert_one(conv_doc)
        conv_id = str(result.inserted_id)

    # Save outbound message
    msg_doc = {
        "conversationId": conv_id,
        "whatsappMessageId": wa_msg_id,
        "direction": "outbound",
        "type": "template",
        "content": {"text": f"[Template: {req.templateName}]", "templateName": req.templateName},
        "status": "sent",
        "timestamp": now,
        "createdAt": now,
    }
    msg_result = await db.db.messages.insert_one(msg_doc)
    msg_doc["_id"] = str(msg_result.inserted_id)

    emit_doc = {**msg_doc, "timestamp": now.isoformat(), "createdAt": now.isoformat()}
    await sio.emit("message:new", emit_doc, room=conv_id)
    await sio.emit("conversation:updated", {"conversationId": conv_id})

    return {
        "message": "Template sent successfully",
        "conversationId": conv_id,
        "whatsappMessageId": wa_msg_id
    }


@router.get("/templates")
async def get_templates(current_user: dict = Depends(get_current_user)):
    """Fetch available message templates from Meta Business API."""
    wa_business_id = current_user.get("waBusinessAccountId") or settings.WA_BUSINESS_ACCOUNT_ID
    wa_token = current_user.get("waAccessToken") or settings.WA_ACCESS_TOKEN

    if not wa_business_id or not wa_token:
        raise HTTPException(status_code=400, detail="WhatsApp credentials not configured. Go to Settings.")

    # Mock mode
    if wa_token == "test_token":
        return {"templates": [
            {"name": "hello_world", "language": "en_US", "status": "APPROVED", "category": "UTILITY"},
        ]}

    url = f"https://graph.facebook.com/v19.0/{wa_business_id}/message_templates"
    headers = {"Authorization": f"Bearer {wa_token}"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Failed to fetch templates: {resp.text}")
        data = resp.json()

    templates = []
    for t in data.get("data", []):
        templates.append({
            "name": t.get("name"),
            "language": t.get("language"),
            "status": t.get("status"),
            "category": t.get("category"),
        })

    return {"templates": templates}
