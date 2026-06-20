from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from pydantic import BaseModel
from app.routes.auth import get_current_user
from app.database import db
from app.config import settings
from datetime import datetime, timezone
from bson import ObjectId
import httpx
from app.socket import sio

router = APIRouter()


def _now():
    return datetime.now(timezone.utc)


class SendMessageRequest(BaseModel):
    text: str


class SendTemplateInConvoRequest(BaseModel):
    templateName: str
    templateLanguage: str = "en_US"
    templateText: Optional[str] = None


@router.get("/")
async def get_conversations(
    search: Optional[str] = "",
    limit: int = Query(100, le=200),
    current_user: dict = Depends(get_current_user),
):
    query = {}
    if search:
        query = {
            "$or": [
                {"customerName":  {"$regex": search, "$options": "i"}},
                {"customerPhone": {"$regex": search, "$options": "i"}},
            ]
        }

    cursor        = db.db.conversations.find(query).sort("lastMessageTime", -1).limit(limit)
    conversations = await cursor.to_list(length=limit)

    for conv in conversations:
        conv["_id"] = str(conv["_id"])

    return {"conversations": conversations}


@router.get("/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(50, ge=10, le=200, description="Messages per page"),
    current_user: dict = Depends(get_current_user),
):
    """
    Fetch messages for a conversation with pagination.
    Messages are returned in ascending timestamp order (oldest first).
    Use `page` and `page_size` for cursor-style pagination.
    """
    try:
        # Reset unread count when opening conversation
        await db.db.conversations.update_one(
            {"_id": ObjectId(conversation_id)},
            {"$set": {"unreadCount": 0}},
        )
    except Exception:
        pass

    skip   = (page - 1) * page_size
    cursor = (
        db.db.messages.find({"conversationId": conversation_id})
        .sort("timestamp", 1)
        .skip(skip)
        .limit(page_size)
    )
    messages = await cursor.to_list(length=page_size)
    total    = await db.db.messages.count_documents({"conversationId": conversation_id})

    for msg in messages:
        msg["_id"] = str(msg["_id"])

    return {
        "messages":  messages,
        "total":     total,
        "page":      page,
        "page_size": page_size,
        "has_more":  (skip + len(messages)) < total,
    }


@router.post("/{conversation_id}/send-text")
async def send_text(
    conversation_id: str,
    req: SendMessageRequest,
    current_user: dict = Depends(get_current_user),
):
    wa_phone_id = current_user.get("waPhoneNumberId") or settings.WA_PHONE_NUMBER_ID
    wa_token    = current_user.get("waAccessToken")    or settings.WA_ACCESS_TOKEN

    if not wa_phone_id or not wa_token:
        raise HTTPException(status_code=400, detail="WhatsApp credentials not configured in settings")

    conversation = await db.db.conversations.find_one({"_id": ObjectId(conversation_id)})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    customer_phone = conversation["customerPhone"]

    # Mock mode
    if wa_token == "test_token":
        message_id = f"mock_msg_{int(_now().timestamp())}"
    else:
        url     = f"https://graph.facebook.com/v19.0/{wa_phone_id}/messages"
        headers = {
            "Authorization": f"Bearer {wa_token}",
            "Content-Type":  "application/json",
        }
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type":    "individual",
            "to":                customer_phone,
            "type":              "text",
            "text":              {"preview_url": False, "body": req.text},
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code not in (200, 201):
                raise HTTPException(status_code=400, detail=f"Failed to send message: {resp.text}")
            message_id = resp.json().get("messages", [{}])[0].get("id", "unknown")

    now         = _now()
    message_doc = {
        "conversationId":    conversation_id,
        "whatsappMessageId": message_id,
        "direction":         "outbound",
        "type":              "text",
        "content":           {"text": req.text},
        "status":            "sent",
        "timestamp":         now,
        "createdAt":         now,
    }
    result               = await db.db.messages.insert_one(message_doc)
    message_doc["_id"]   = str(result.inserted_id)

    await db.db.conversations.update_one(
        {"_id": ObjectId(conversation_id)},
        {"$set": {"lastMessage": req.text, "lastMessageTime": now, "updatedAt": now}},
    )

    emit_doc = {**message_doc, "timestamp": now.isoformat(), "createdAt": now.isoformat()}
    await sio.emit("message:new",            emit_doc,                        room=conversation_id)
    await sio.emit("conversation:updated",   {"conversationId": conversation_id})

    return message_doc


@router.post("/{conversation_id}/send-template")
async def send_template_in_conversation(
    conversation_id: str,
    req: SendTemplateInConvoRequest,
    current_user: dict = Depends(get_current_user),
):
    """Send a template message within an existing conversation."""
    wa_phone_id = current_user.get("waPhoneNumberId") or settings.WA_PHONE_NUMBER_ID
    wa_token    = current_user.get("waAccessToken")    or settings.WA_ACCESS_TOKEN

    if not wa_phone_id or not wa_token:
        raise HTTPException(status_code=400, detail="WhatsApp credentials not configured in settings")

    conversation = await db.db.conversations.find_one({"_id": ObjectId(conversation_id)})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    customer_phone = conversation["customerPhone"]

    if wa_token == "test_token":
        message_id = f"mock_tpl_{int(_now().timestamp())}"
    else:
        url     = f"https://graph.facebook.com/v19.0/{wa_phone_id}/messages"
        headers = {
            "Authorization": f"Bearer {wa_token}",
            "Content-Type":  "application/json",
        }
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type":    "individual",
            "to":                customer_phone,
            "type":              "template",
            "template": {
                "name":     req.templateName,
                "language": {"code": req.templateLanguage},
            },
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code not in (200, 201):
                raise HTTPException(status_code=400, detail=f"Failed to send template: {resp.text}")
            message_id = resp.json().get("messages", [{}])[0].get("id", "unknown")

    now          = _now()
    display_text = req.templateText if req.templateText else f"[Template: {req.templateName}]"
    message_doc  = {
        "conversationId":    conversation_id,
        "whatsappMessageId": message_id,
        "direction":         "outbound",
        "type":              "template",
        "content":           {"text": display_text, "templateName": req.templateName},
        "status":            "sent",
        "timestamp":         now,
        "createdAt":         now,
    }
    result             = await db.db.messages.insert_one(message_doc)
    message_doc["_id"] = str(result.inserted_id)

    await db.db.conversations.update_one(
        {"_id": ObjectId(conversation_id)},
        {"$set": {"lastMessage": display_text, "lastMessageTime": now, "updatedAt": now}},
    )

    emit_doc = {**message_doc, "timestamp": now.isoformat(), "createdAt": now.isoformat()}
    await sio.emit("message:new",          emit_doc,                        room=conversation_id)
    await sio.emit("conversation:updated", {"conversationId": conversation_id})

    return message_doc
