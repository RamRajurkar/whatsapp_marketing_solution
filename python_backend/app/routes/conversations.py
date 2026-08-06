from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from pydantic import BaseModel
from app.routes.auth import get_current_user
from app.database import db
from app.config import settings
from app.utils.template_utils import build_template_components
from datetime import datetime, timezone
from bson import ObjectId
import httpx
from app.socket import sio
import os
import mimetypes
from app.utils.image_utils import compress_image_bytes

router = APIRouter()


def _now():
    return datetime.now(timezone.utc)


class SendMessageRequest(BaseModel):
    text: str


class SendTemplateInConvoRequest(BaseModel):
    templateName: str
    templateLanguage: str = "en_US"
    templateText: Optional[str] = None
    templateComponents: Optional[List[dict]] = None  # Template component definitions from Meta API
    headerMediaUrl: Optional[str] = None             # URL for image/video/document headers
    headerMediaId: Optional[str] = None              # Media ID from WhatsApp API for image/video/document headers
    bodyParams: Optional[List[str]] = None           # Values for body variables {{1}}, {{2}}, etc.
    buttonParams: Optional[List[str]] = None         # Values for button parameters (index-aligned with buttons array)
    carouselCards: Optional[List[dict]] = None       # Per-card params: {mediaUrl, bodyParams}


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
        .sort("timestamp", -1)
        .skip(skip)
        .limit(page_size)
    )
    messages = await cursor.to_list(length=page_size)
    
    # Reverse to return in chronological order (oldest first in the array) for the UI
    messages.reverse()
    
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

    # 24-hour customer service window check (Meta Policy Enforcement)
    last_inbound = await db.db.messages.find_one(
        {"conversationId": conversation_id, "direction": "inbound"},
        sort=[("timestamp", -1)]
    )
    if not last_inbound:
        raise HTTPException(
            status_code=400,
            detail="No customer inbound message found. You can only send template messages to initiate conversations."
        )
    last_inbound_time = last_inbound["timestamp"]
    from datetime import timedelta
    if _now() - last_inbound_time.replace(tzinfo=timezone.utc if last_inbound_time.tzinfo else None) > timedelta(hours=24):
        raise HTTPException(
            status_code=400,
            detail="The 24-hour customer service window is closed. You can only send Meta-approved template messages outside this window."
        )

    customer_phone = conversation["customerPhone"]

    # Mock mode
    if wa_token == "test_token":
        message_id = f"mock_msg_{int(_now().timestamp())}"
    else:
        url     = f"https://graph.facebook.com/{settings.WA_API_VERSION}/{wa_phone_id}/messages"
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

        client = get_http_client()
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


@router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a conversation and all its messages."""
    try:
        obj_id = ObjectId(conversation_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid conversation ID")

    conv = await db.db.conversations.find_one({"_id": obj_id})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Delete all messages in this conversation
    await db.db.messages.delete_many({"conversationId": conversation_id})
    # Delete the conversation itself
    await db.db.conversations.delete_one({"_id": obj_id})

    await sio.emit("conversation:deleted", {"conversationId": conversation_id})

    return {"message": "Conversation deleted successfully"}




from fastapi import UploadFile, File, Form
from app.http_client import get_http_client


@router.post("/{conversation_id}/upload-and-send")
async def upload_and_send_media(
    conversation_id: str,
    file: UploadFile = File(...),
    caption: str = Form(""),
    current_user: dict = Depends(get_current_user),
):
    """Upload a file and send it as a media message in a conversation."""
    wa_phone_id = current_user.get("waPhoneNumberId") or settings.WA_PHONE_NUMBER_ID
    wa_token    = current_user.get("waAccessToken")    or settings.WA_ACCESS_TOKEN

    if not wa_phone_id or not wa_token:
        raise HTTPException(status_code=400, detail="WhatsApp credentials not configured")

    conversation = await db.db.conversations.find_one({"_id": ObjectId(conversation_id)})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # 24-hour customer service window check (Meta Policy Enforcement)
    last_inbound = await db.db.messages.find_one(
        {"conversationId": conversation_id, "direction": "inbound"},
        sort=[("timestamp", -1)]
    )
    if not last_inbound:
        raise HTTPException(
            status_code=400,
            detail="No customer inbound message found. You can only send template messages to initiate conversations."
        )
    last_inbound_time = last_inbound["timestamp"]
    from datetime import timedelta
    if _now() - last_inbound_time.replace(tzinfo=timezone.utc if last_inbound_time.tzinfo else None) > timedelta(hours=24):
        raise HTTPException(
            status_code=400,
            detail="The 24-hour customer service window is closed. You can only send Meta-approved template messages outside this window."
        )

    customer_phone = conversation["customerPhone"]
    file_bytes = await file.read()
    file_type = file.content_type or "application/octet-stream"
    filename = file.filename or "file"

    # Determine WhatsApp media type
    if file_type.startswith("image/"):
        wa_media_type = "image"
    elif file_type.startswith("video/"):
        wa_media_type = "video"
    elif file_type.startswith("audio/"):
        wa_media_type = "audio"
    else:
        wa_media_type = "document"

    now = _now()

    if wa_token == "test_token":
        message_id = f"mock_media_{int(now.timestamp())}"
    else:
        # Step 1: Upload media to WhatsApp
        upload_url = f"https://graph.facebook.com/{settings.WA_API_VERSION}/{wa_phone_id}/media"
        upload_headers = {"Authorization": f"Bearer {wa_token}"}
        upload_files = {"file": (filename, file_bytes, file_type)}
        upload_data = {"messaging_product": "whatsapp"}

        client = get_http_client()
        upload_resp = await client.post(upload_url, headers=upload_headers, data=upload_data, files=upload_files)
        if upload_resp.status_code not in (200, 201):
            raise HTTPException(status_code=400, detail=f"Failed to upload media: {upload_resp.text}")
        media_id = upload_resp.json().get("id")

        # Step 2: Send media message
        send_url = f"https://graph.facebook.com/{settings.WA_API_VERSION}/{wa_phone_id}/messages"
        send_headers = {
            "Authorization": f"Bearer {wa_token}",
            "Content-Type": "application/json",
        }
        media_obj = {"id": media_id}
        if caption and wa_media_type in ("image", "video", "document"):
            media_obj["caption"] = caption
        if wa_media_type == "document":
            media_obj["filename"] = filename

        send_payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": customer_phone,
            "type": wa_media_type,
            wa_media_type: media_obj,
        }

        client = get_http_client()
        resp = await client.post(send_url, json=send_payload, headers=send_headers)
        if resp.status_code not in (200, 201):
            raise HTTPException(status_code=400, detail=f"Failed to send media: {resp.text}")
        message_id = resp.json().get("messages", [{}])[0].get("id", "unknown")

    display_text = caption if caption else f"[{wa_media_type.capitalize()}]"
    message_doc = {
        "conversationId":    conversation_id,
        "whatsappMessageId": message_id,
        "direction":         "outbound",
        "type":              wa_media_type,
        "content":           {"text": display_text, "filename": filename, "mimeType": file_type},
        "status":            "sent",
        "timestamp":         now,
        "createdAt":         now,
    }
    result = await db.db.messages.insert_one(message_doc)
    message_doc["_id"] = str(result.inserted_id)

    await db.db.conversations.update_one(
        {"_id": ObjectId(conversation_id)},
        {"$set": {"lastMessage": display_text, "lastMessageTime": now, "updatedAt": now}},
    )

    emit_doc = {**message_doc, "timestamp": now.isoformat(), "createdAt": now.isoformat()}
    await sio.emit("message:new",          emit_doc,                        room=conversation_id)
    await sio.emit("conversation:updated", {"conversationId": conversation_id})

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

    final_header_url = req.headerMediaUrl
    final_header_id = req.headerMediaId

    if wa_token == "test_token":
        message_id = f"mock_tpl_{int(_now().timestamp())}"
        status = "sent"
        error_reason = None
    else:
        url     = f"https://graph.facebook.com/{settings.WA_API_VERSION}/{wa_phone_id}/messages"
        headers = {
            "Authorization": f"Bearer {wa_token}",
            "Content-Type":  "application/json",
        }
        template_payload: dict = {
            "name":     req.templateName,
            "language": {"code": req.templateLanguage},
        }

        from app.utils.template_utils import process_header_media
        final_header_url, final_header_id = await process_header_media(
            header_media_url=req.headerMediaUrl,
            header_media_id=req.headerMediaId,
            wa_phone_id=wa_phone_id,
            wa_token=wa_token,
        )

        # Build components array for templates with media/variables/carousel
        if req.templateComponents:
            components = build_template_components(
                template_components=req.templateComponents,
                header_media_url=final_header_url,
                header_media_id=final_header_id,
                body_params=req.bodyParams,
                carousel_cards=req.carouselCards,
                button_params=req.buttonParams,
            )
            if components:
                template_payload["components"] = components

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type":    "individual",
            "to":                customer_phone,
            "type":              "template",
            "template":          template_payload,
        }

        client = get_http_client()
        resp = await client.post(url, json=payload, headers=headers)
        if resp.status_code not in (200, 201):
            status = "failed"
            message_id = "unknown"
            try:
                err_data = resp.json().get("error", {})
                error_reason = err_data.get("message") or resp.text
            except Exception:
                error_reason = resp.text
        else:
            status = "sent"
            error_reason = None
            message_id = resp.json().get("messages", [{}])[0].get("id", "unknown")

    now          = _now()
    display_text = req.templateText if req.templateText else f"[Template: {req.templateName}]"
    content_data = {
        "text": display_text,
        "templateName": req.templateName,
        "templateLanguage": req.templateLanguage,
        "headerMediaUrl": final_header_url,
        "bodyParams": req.bodyParams or [],
        "buttonParams": req.buttonParams or [],
        "carouselCards": req.carouselCards or [],
    }

    message_doc  = {
        "conversationId":    conversation_id,
        "whatsappMessageId": message_id,
        "direction":         "outbound",
        "type":              "template",
        "content":           content_data,
        "status":            status,
        "errorReason":       error_reason,
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

    if status == "failed":
        raise HTTPException(status_code=400, detail=f"Failed to send template: {error_reason}")

    return message_doc


@router.post("/{conversation_id}/messages/{message_id}/retry")
async def retry_message(
    conversation_id: str,
    message_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Retry sending a failed message."""
    wa_phone_id = current_user.get("waPhoneNumberId") or settings.WA_PHONE_NUMBER_ID
    wa_token    = current_user.get("waAccessToken") or settings.WA_ACCESS_TOKEN

    if not wa_phone_id or not wa_token:
        raise HTTPException(status_code=400, detail="WhatsApp credentials not configured.")

    conversation = await db.db.conversations.find_one({"_id": ObjectId(conversation_id)})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    message = await db.db.messages.find_one({"_id": ObjectId(message_id), "conversationId": conversation_id})
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    customer_phone = conversation["customerPhone"]

    if message.get("type") == "text":
        text_content = message.get("content", {}).get("text", "")
        if not text_content:
            raise HTTPException(status_code=400, detail="Message content empty")

        url = f"https://graph.facebook.com/{settings.WA_API_VERSION}/{wa_phone_id}/messages"
        headers = {"Authorization": f"Bearer {wa_token}", "Content-Type": "application/json"}
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": customer_phone,
            "type": "text",
            "text": {"preview_url": False, "body": text_content},
        }
        client = get_http_client()
        resp = await client.post(url, json=payload, headers=headers)
        if resp.status_code not in (200, 201):
            detail_err = resp.json().get("error", {}).get("message", resp.text)
            await db.db.messages.update_one(
                {"_id": ObjectId(message_id)},
                {"$set": {"status": "failed", "errorReason": detail_err, "updatedAt": _now()}}
            )
            raise HTTPException(status_code=400, detail=f"Failed to retry message: {detail_err}")
        
        new_wa_id = resp.json().get("messages", [{}])[0].get("id", "unknown")
        now = _now()
        await db.db.messages.update_one(
            {"_id": ObjectId(message_id)},
            {"$set": {"whatsappMessageId": new_wa_id, "status": "sent", "errorReason": None, "updatedAt": now}}
        )
        updated_doc = await db.db.messages.find_one({"_id": ObjectId(message_id)})
        updated_doc["_id"] = str(updated_doc["_id"])
        emit_doc = {**updated_doc, "timestamp": updated_doc["timestamp"].isoformat(), "createdAt": updated_doc["createdAt"].isoformat()}
        await sio.emit("message:status", emit_doc, room=conversation_id)
        return updated_doc
    else:
        raise HTTPException(status_code=400, detail="Retrying this message type directly is not supported. Please use the template modal.")

