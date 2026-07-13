from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from typing import Optional, List
from pydantic import BaseModel
from app.routes.auth import get_current_user
from app.database import db
from app.config import settings
from app.socket import sio
from app.utils.phone import normalize_indian_phone
from app.utils.template_utils import build_template_components
from bson import ObjectId
from datetime import datetime, timezone
import httpx
import os
import mimetypes
import re
from app.utils.image_utils import compress_image_bytes
from app.http_client import get_http_client


def _now():
    return datetime.now(timezone.utc)

router = APIRouter()


class SendTextRequest(BaseModel):
    phone: str
    text: str


class SendTemplateRequest(BaseModel):
    phone: str
    templateName: str
    templateLanguage: str = "en"
    templateComponents: Optional[List[dict]] = None  # Template component definitions from Meta API
    headerMediaUrl: Optional[str] = None             # URL for image/video/document headers
    headerMediaId: Optional[str] = None              # Direct WhatsApp Media ID (e.g. from upload-media)
    bodyParams: Optional[List[str]] = None           # Values for body variables {{1}}, {{2}}, etc.
    carouselCards: Optional[List[dict]] = None       # Per-card params: {mediaUrl, bodyParams}


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

    now = _now()

    # Mock mode
    if wa_token == "test_token":
        wa_msg_id = f"mock_msg_{int(now.timestamp())}"
    else:
        # Send via Graph API
        url = f"https://graph.facebook.com/{settings.WA_API_VERSION}/{wa_phone_id}/messages"
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
    
        client = get_http_client()
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

    now = _now()

    # Mock mode
    if wa_token == "test_token":
        wa_msg_id = f"mock_tpl_{int(now.timestamp())}"
    else:
        # Send via Graph API
        url = f"https://graph.facebook.com/{settings.WA_API_VERSION}/{wa_phone_id}/messages"
        headers = {
            "Authorization": f"Bearer {wa_token}",
            "Content-Type": "application/json"
        }
        template_payload: dict = {
            "name": req.templateName,
            "language": {"code": req.templateLanguage}
        }

        # Handle local media URLs that Meta cannot download
        final_header_url = req.headerMediaUrl
        final_header_id = req.headerMediaId

        if final_header_url and ("localhost" in final_header_url or "/uploads/" in final_header_url):
            # It's a local file. We must upload it to Meta first to get a media_id
            filename = final_header_url.split("/")[-1].split("?")[0]
            local_path = os.path.join("uploads", "media", filename)
            
            if os.path.exists(local_path):
                file_type, _ = mimetypes.guess_type(local_path)
                file_type = file_type or "image/jpeg"
                
                with open(local_path, "rb") as f:
                    file_bytes = f.read()
                
                # Compress image if too large for WhatsApp (5 MB limit)
                file_bytes, filename, file_type = compress_image_bytes(file_bytes, filename, file_type)
                
                upload_url = f"https://graph.facebook.com/{settings.WA_API_VERSION}/{wa_phone_id}/media"
                upload_files = {
                    "file": (filename, file_bytes, file_type)
                }
                upload_data = {
                    "messaging_product": "whatsapp"
                }
                upload_headers = {
                    "Authorization": f"Bearer {wa_token}"
                }
                u_client = get_http_client()
                u_resp = await u_client.post(upload_url, headers=upload_headers, data=upload_data, files=upload_files)
                if u_resp.status_code in (200, 201):
                    final_header_id = u_resp.json().get("id")
                    final_header_url = None # Unset URL since we have ID
                else:
                    raise HTTPException(status_code=400, detail=f"Failed to auto-upload template media to WhatsApp: {u_resp.text}")
            else:
                raise HTTPException(status_code=400, detail=f"Local media file not found: {local_path}")

        # Build components array for templates with media/variables/carousel
        if req.templateComponents:
            components = build_template_components(
                template_components=req.templateComponents,
                header_media_url=final_header_url,
                header_media_id=final_header_id,
                body_params=req.bodyParams,
                carousel_cards=req.carouselCards,
            )
            if components:
                template_payload["components"] = components

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "template",
            "template": template_payload
        }
    
        client = get_http_client()
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

    url = f"https://graph.facebook.com/{settings.WA_API_VERSION}/{wa_business_id}/message_templates"
    headers = {"Authorization": f"Bearer {wa_token}"}

    client = get_http_client()
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
            "components": t.get("components", []),
        })

    return {"templates": templates}

@router.post("/templates")
async def create_template(
    name: str = Form(...),
    category: str = Form(...),
    language: str = Form(...),
    bodyText: str = Form(...),
    file: Optional[UploadFile] = File(None),
    current_user: dict = Depends(get_current_user),
):
    """Create a new template on Meta WhatsApp Manager with an optional image header."""
    wa_business_id = current_user.get("waBusinessAccountId") or settings.WA_BUSINESS_ACCOUNT_ID
    wa_token = current_user.get("waAccessToken") or settings.WA_ACCESS_TOKEN
    wa_app_id = settings.WA_APP_ID

    if not wa_business_id or not wa_token or not wa_app_id:
        raise HTTPException(status_code=400, detail="Missing WhatsApp credentials or WA_APP_ID in settings")

    components = []
    
    # 1. Handle Image Header if present
    if file:
        file_bytes = await file.read()
        file_length = len(file_bytes)
        file_type = file.content_type or "image/jpeg"

        client = get_http_client()
        # Step A: Get upload session
        session_url = f"https://graph.facebook.com/{settings.WA_API_VERSION}/{wa_app_id}/uploads"
        session_params = {"file_length": file_length, "file_type": file_type}
        session_headers = {"Authorization": f"Bearer {wa_token}"}
        session_resp = await client.post(session_url, params=session_params, headers=session_headers)
        if session_resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Failed to create upload session: {session_resp.text}")
        session_id = session_resp.json().get("id")

        # Step B: Upload file
        upload_url = f"https://graph.facebook.com/{settings.WA_API_VERSION}/{session_id}"
        upload_headers = {"Authorization": f"OAuth {wa_token}", "file_offset": "0"}
        upload_resp = await client.post(upload_url, headers=upload_headers, content=file_bytes)
        if upload_resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Failed to upload image: {upload_resp.text}")
        header_handle = upload_resp.json().get("h")

        components.append({
            "type": "HEADER",
            "format": "IMAGE",
            "example": {
                "header_handle": [header_handle]
            }
        })

    # 2. Add Body component
    body_component = {
        "type": "BODY",
        "text": bodyText
    }
    
    vars_found = re.findall(r'\{\{(\d+)\}\}', bodyText)
    if vars_found:
        max_var = max([int(v) for v in vars_found])
        examples = [f"Value{i}" for i in range(1, max_var + 1)]
        body_component["example"] = {"body_text": [examples]}

    components.append(body_component)

    # 3. Create Template
    create_url = f"https://graph.facebook.com/{settings.WA_API_VERSION}/{wa_business_id}/message_templates"
    create_payload = {
        "name": name,
        "language": language,
        "category": category,
        "components": components
    }
    create_headers = {"Authorization": f"Bearer {wa_token}", "Content-Type": "application/json"}

    client = get_http_client()
    resp = await client.post(create_url, json=create_payload, headers=create_headers)
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=400, detail=f"Failed to create template: {resp.text}")
    return resp.json()

@router.post("/upload-media")
async def upload_media(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload media directly to WhatsApp API for sending in messages/templates."""
    wa_phone_id = current_user.get("waPhoneNumberId") or settings.WA_PHONE_NUMBER_ID
    wa_token = current_user.get("waAccessToken") or settings.WA_ACCESS_TOKEN

    if not wa_phone_id or not wa_token:
        raise HTTPException(status_code=400, detail="Missing WhatsApp credentials in settings")

    file_bytes = await file.read()
    file_type = file.content_type or "image/jpeg"

    upload_url = f"https://graph.facebook.com/{settings.WA_API_VERSION}/{wa_phone_id}/media"
    headers = {"Authorization": f"Bearer {wa_token}"}
    
    # We must use multipart/form-data for the media API
    files = {
        "file": (file.filename or "media.jpg", file_bytes, file_type)
    }
    data = {
        "messaging_product": "whatsapp"
    }

    client = get_http_client()
    resp = await client.post(upload_url, headers=headers, data=data, files=files)
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=400, detail=f"Failed to upload media to WhatsApp: {resp.text}")
        
    return {"id": resp.json().get("id")}
