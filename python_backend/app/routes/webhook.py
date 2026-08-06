import hmac
import hashlib
import json
import os
import httpx
from fastapi import APIRouter, Request, Response, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from app.database import db
from app.socket import sio
from app.utils.phone import normalize_indian_phone
from app.config import settings
from app.services.bot_cache import get_bot_settings, get_greeting_payload
from bson import ObjectId
from datetime import datetime, timezone
import pytz
from app.http_client import get_http_client

router = APIRouter()


def _verify_meta_signature(payload: bytes, signature_header: str, app_secret: str) -> bool:
    """
    Verify the X-Hub-Signature-256 header sent by Meta on every webhook POST.
    Returns True if valid, False otherwise.
    """
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(
        app_secret.encode("utf-8"), payload, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)


def _now():
    return datetime.now(timezone.utc)


def _serialize_mongo_doc(doc: dict) -> dict:
    clean = {}
    for k, v in doc.items():
        if isinstance(v, ObjectId):
            clean[k] = str(v)
        elif isinstance(v, datetime):
            clean[k] = v.isoformat()
        elif isinstance(v, dict):
            clean[k] = _serialize_mongo_doc(v)
        elif isinstance(v, list):
            clean[k] = [
                str(x) if isinstance(x, ObjectId)
                else x.isoformat() if isinstance(x, datetime)
                else _serialize_mongo_doc(x) if isinstance(x, dict)
                else x
                for x in v
            ]
        else:
            clean[k] = v
    return clean


# ─────────────────────────────────────────────────────────────────────────────
#  Webhook Verification (GET)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/")
@router.get("")
async def verify_webhook(request: Request):
    """Handle Meta webhook verification challenge."""
    mode      = request.query_params.get("hub.mode")
    token     = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    if mode and token:
        # Use the first registered user's verify token, falling back to settings
        user = await db.db.users.find_one({})
        valid_token = None
        if user and user.get("waVerifyToken"):
            valid_token = user.get("waVerifyToken")
        else:
            valid_token = settings.WA_VERIFY_TOKEN

        if valid_token and valid_token == token:
            return Response(content=challenge, status_code=200)
        raise HTTPException(status_code=403, detail="Forbidden — verify token mismatch")
    raise HTTPException(status_code=400, detail="Bad Request — missing hub parameters")


# ─────────────────────────────────────────────────────────────────────────────
#  Core Webhook Processing (shared by real webhook + simulator)
# ─────────────────────────────────────────────────────────────────────────────

async def _process_webhook_body(body: dict) -> dict:
    """
    Core webhook processing logic extracted into a reusable function.
    Processes incoming messages and delivery statuses from WhatsApp.

    Returns a summary dict: {messages_processed, statuses_processed, bot_replies}
    """
    results = {"messages_processed": 0, "statuses_processed": 0, "bot_replies": []}

    if body.get("object") != "whatsapp_business_account":
        return results

    for entry in body.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})

            # ── Incoming messages ─────────────────────────────────────────
            if "messages" in value:
                for msg in value["messages"]:
                    contact = value["contacts"][0] if "contacts" in value else {}
                    phone_number = msg.get("from")
                    try:
                        phone_number = normalize_indian_phone(phone_number)
                    except ValueError:
                        pass  # Keep original if normalization fails

                    customer_name = contact.get("profile", {}).get("name", "Unknown")
                    message_id    = msg.get("id")
                    # We use server time instead of Meta's timestamp to prevent clock skew 
                    # from sorting bot replies above customer messages.
                    timestamp = _now()
                    msg_type      = msg.get("type")

                    # Extract text content based on message type
                    if msg_type == "text":
                        text_content = msg.get("text", {}).get("body", "")
                    elif msg_type == "interactive":
                        # Button reply — extract the button title the user tapped
                        interactive_data = msg.get("interactive", {})
                        if interactive_data.get("type") == "button_reply":
                            text_content = interactive_data.get("button_reply", {}).get("title", "[button reply]")
                        elif interactive_data.get("type") == "list_reply":
                            text_content = interactive_data.get("list_reply", {}).get("title", "[list reply]")
                        else:
                            text_content = "[interactive message]"
                    else:
                        text_content = f"[{msg_type} message]"

                    # Resolve tenant_id for SaaS
                    from app.utils.tenant import resolve_webhook_tenant
                    metadata_wa_id = value.get("metadata", {}).get("phone_number_id")
                    tenant_id = await resolve_webhook_tenant(metadata_wa_id)

                    # Find or create conversation
                    conv_query = {"customerPhone": phone_number}
                    if tenant_id:
                        conv_query["tenantId"] = tenant_id

                    conversation = await db.db.conversations.find_one(conv_query)

                    if not conversation:
                        conv_doc = {
                            "customerPhone":   phone_number,
                            "customerName":    customer_name,
                            "lastMessage":     text_content,
                            "lastMessageTime": timestamp,
                            "unreadCount":     1,
                            "status":          "active",
                            "createdAt":       _now(),
                            "updatedAt":       timestamp,
                        }
                        if tenant_id:
                            conv_doc["tenantId"] = tenant_id
                        result = await db.db.conversations.insert_one(conv_doc)
                        conv_id = str(result.inserted_id)
                    else:
                        conv_id = str(conversation["_id"])
                        await db.db.conversations.update_one(
                            {"_id": conversation["_id"]},
                            {
                                "$set": {
                                    "lastMessage":     text_content,
                                    "lastMessageTime": timestamp,
                                    "customerName":    customer_name,
                                    "updatedAt":       _now(),
                                },
                                "$inc": {"unreadCount": 1},
                            },
                        )

                    # Always sync profile name to customers and broadcast_recipients if name is provided
                    if customer_name and customer_name != "Unknown" and customer_name != phone_number:
                        await db.db.customers.update_one(
                            {"phone": phone_number},
                            {"$set": {"name": customer_name, "updatedAt": _now()}}
                        )
                        await db.db.broadcast_recipients.update_many(
                            {"customerPhone": phone_number},
                            {"$set": {"customerName": customer_name, "updatedAt": _now()}}
                        )

                    # Save inbound message
                    message_doc = {
                        "conversationId":    conv_id,
                        "whatsappMessageId": message_id,
                        "direction":         "inbound",
                        "type":              msg_type,
                        "content":           {"text": text_content},
                        "status":            "delivered",
                        "timestamp":         timestamp,
                        "createdAt":         _now(),
                    }
                    if tenant_id:
                        message_doc["tenantId"] = tenant_id
                    await db.db.messages.insert_one(message_doc)
                    message_doc["_id"] = str(message_doc.pop("_id"))

                    emit_doc = {
                        **message_doc,
                        "timestamp": timestamp.isoformat(),
                        "createdAt": message_doc["createdAt"].isoformat(),
                    }
                    await sio.emit("message:new", emit_doc, room=conv_id)
                    await sio.emit("conversation:updated", {"conversationId": conv_id})

                    results["messages_processed"] += 1

                    # ── Bot Logic ─────────────────────────────────────────
                    try:
                        bot_reply = await _run_bot_logic(msg, msg_type, text_content, phone_number, conv_id, tenant_id)
                        if bot_reply:
                            results["bot_replies"].append(bot_reply)
                    except Exception as bot_err:
                        # Never let bot errors break the webhook — log and continue
                        print(f"[BOT ERROR] {bot_err}")
                        results["bot_replies"].append({"error": str(bot_err)})

            # ── Delivery / read statuses ──────────────────────────────────
            elif "statuses" in value:
                for status in value["statuses"]:
                    status_msg_id = status.get("id")
                    status_type   = status.get("status")

                    update_fields: dict = {"status": status_type, "updatedAt": _now()}

                    # Persist failure reason when the status is "failed"
                    if status_type == "failed":
                        errors = status.get("errors", [])
                        if errors:
                            err = errors[0]
                            code    = err.get("code", "")
                            message = err.get("message", "") or err.get("title", "")
                            details = err.get("error_data", {})
                            if isinstance(details, dict):
                                details = details.get("details", "")
                            reason = message
                            if details:
                                reason = f"{message}: {details}"
                            if code:
                                reason = f"[#{code}] {reason}"
                            update_fields["errorReason"] = reason
                        else:
                            update_fields["errorReason"] = "Message delivery failed"

                    msg_update = await db.db.messages.find_one_and_update(
                        {"whatsappMessageId": status_msg_id},
                        {"$set": update_fields},
                        return_document=True,
                    )
                    if msg_update:
                        conv_id = str(msg_update.get("conversationId", ""))
                        if conv_id:
                            emit_doc = _serialize_mongo_doc(msg_update)
                            await sio.emit("message:status", emit_doc, room=conv_id)

                    # Update broadcast_recipients collection if this message belongs to a broadcast
                    rec_update = {"status": status_type, "updatedAt": _now()}
                    if status_type == "delivered":
                        rec_update["deliveredAt"] = _now()
                    elif status_type == "read":
                        rec_update["readAt"] = _now()
                    elif status_type == "failed":
                        errors = status.get("errors", [])
                        if errors:
                            err = errors[0]
                            code = err.get("code", 0)
                            msg_text = err.get("message", "")
                            rec_update["errorCode"] = code
                            rec_update["errorReason"] = msg_text
                            rec_update["isRetryable"] = (code in (131049, 130429, 131056, 131057))

                    recipient_phone = status.get("recipient_id")
                    rec_doc = await db.db.broadcast_recipients.find_one_and_update(
                        {"whatsappMessageId": status_msg_id},
                        {"$set": rec_update},
                        return_document=True,
                    )
                    if not rec_doc and recipient_phone:
                        rec_doc = await db.db.broadcast_recipients.find_one_and_update(
                            {"customerPhone": recipient_phone, "status": {"$in": ["sent", "delivered"]}},
                            {"$set": {**rec_update, "whatsappMessageId": status_msg_id}},
                            return_document=True,
                        )

                    if rec_doc and rec_doc.get("broadcastId"):
                        try:
                            inc_field = f"stats.{status_type}"
                            await db.db.broadcasts.update_one(
                                {"_id": ObjectId(rec_doc["broadcastId"])},
                                {"$inc": {inc_field: 1}, "$set": {"updatedAt": _now()}}
                            )
                        except Exception:
                            pass

async def _run_bot_logic(
    msg: dict, 
    msg_type: str, 
    text_content: str, 
    phone_number: str, 
    conv_id: str,
    tenant_id: Optional[str] = None
) -> Optional[dict]:
    """
    Execute chatbot auto-reply logic for an incoming message.
    Delegates parsing to the unified state-machine executor.
    """
    from app.services.bot_executor import execute_chatbot_flow
    return await execute_chatbot_flow(
        phone_number=phone_number,
        incoming_msg=msg,
        text_content=text_content,
        tenant_id=tenant_id,
        conv_id=conv_id
    )



# ─────────────────────────────────────────────────────────────────────────────
#  Webhook POST (production — called by Meta)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/")
@router.post("")
async def receive_webhook(request: Request, background_tasks: BackgroundTasks):
    """Handle incoming messages and delivery statuses from WhatsApp."""

    raw_body = await request.body()

    # ── Signature verification ────────────────────────────────────────────────
    if settings.WA_APP_SECRET:
        signature = request.headers.get("X-Hub-Signature-256", "")
        if not _verify_meta_signature(raw_body, signature, settings.WA_APP_SECRET):
            raise HTTPException(status_code=403, detail="Invalid webhook signature")

    body = json.loads(raw_body)
    background_tasks.add_task(_process_webhook_body, body)

    return Response(content="EVENT_RECEIVED", status_code=200)


# ─────────────────────────────────────────────────────────────────────────────
#  Webhook Simulator (development mode only)
# ─────────────────────────────────────────────────────────────────────────────

class SimulateRequest(BaseModel):
    senderPhone: str
    senderName: str = "Simulator User"
    messageText: str = "hi"
    messageType: str = "text"          # "text" or "interactive"
    buttonId: Optional[str] = None     # e.g. "btn_address", "btn_menu", "btn_timings"
    buttonTitle: Optional[str] = None  # e.g. "📍 Address"


@router.post("/simulate")
async def simulate_webhook(req: SimulateRequest):
    """
    Developer tool — build a Meta-format webhook payload and process it
    through the real bot logic. Available when DEV_MODE=1 (default in dev).
    """
    if os.getenv("DEV_MODE", "1") != "1":
        raise HTTPException(status_code=403, detail="Simulator is only available in development mode")

    # Normalize phone
    try:
        phone = normalize_indian_phone(req.senderPhone)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    timestamp_str = str(int(_now().timestamp()))
    sim_msg_id    = f"sim_{int(_now().timestamp() * 1000)}"

    # Build the EXACT payload format that Meta sends
    if req.messageType == "interactive" and req.buttonId:
        msg_obj = {
            "from": phone,
            "id": sim_msg_id,
            "timestamp": timestamp_str,
            "type": "interactive",
            "interactive": {
                "type": "button_reply",
                "button_reply": {
                    "id": req.buttonId,
                    "title": req.buttonTitle or req.buttonId,
                }
            }
        }
    else:
        msg_obj = {
            "from": phone,
            "id": sim_msg_id,
            "timestamp": timestamp_str,
            "type": "text",
            "text": {"body": req.messageText}
        }

    payload = {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "SIMULATED",
            "changes": [{
                "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {
                        "display_phone_number": "0000000000",
                        "phone_number_id": settings.WA_PHONE_NUMBER_ID or "simulated",
                    },
                    "contacts": [{
                        "profile": {"name": req.senderName},
                        "wa_id": phone,
                    }],
                    "messages": [msg_obj],
                },
                "field": "messages",
            }],
        }],
    }

    results = await _process_webhook_body(payload)

    return {
        "message": "Simulated webhook processed successfully",
        "simulatedPayload": payload,
        "results": results,
    }
