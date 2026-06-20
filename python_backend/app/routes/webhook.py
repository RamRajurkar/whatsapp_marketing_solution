import hmac
import hashlib
from fastapi import APIRouter, Request, Response, HTTPException
from app.database import db
from app.socket import sio
from app.utils.phone import normalize_indian_phone
from app.config import settings
from datetime import datetime, timezone

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


@router.get("/")
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


@router.post("/")
async def receive_webhook(request: Request):
    """Handle incoming messages and delivery statuses from WhatsApp."""

    raw_body = await request.body()

    # ── Signature verification ────────────────────────────────────────────────
    if settings.WA_APP_SECRET:
        signature = request.headers.get("X-Hub-Signature-256", "")
        if not _verify_meta_signature(raw_body, signature, settings.WA_APP_SECRET):
            raise HTTPException(status_code=403, detail="Invalid webhook signature")

    import json
    body = json.loads(raw_body)

    if body.get("object") == "whatsapp_business_account":
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
                        timestamp     = datetime.utcfromtimestamp(
                            int(msg.get("timestamp", _now().timestamp()))
                        ).replace(tzinfo=timezone.utc)
                        msg_type      = msg.get("type")
                        text_content  = (
                            msg.get("text", {}).get("body", "")
                            if msg_type == "text"
                            else f"[{msg_type} message]"
                        )

                        # Find or create conversation
                        conversation = await db.db.conversations.find_one(
                            {"customerPhone": phone_number}
                        )

                        if not conversation:
                            result = await db.db.conversations.insert_one({
                                "customerPhone":   phone_number,
                                "customerName":    customer_name,
                                "lastMessage":     text_content,
                                "lastMessageTime": timestamp,
                                "unreadCount":     1,
                                "status":          "active",
                                "createdAt":       _now(),
                                "updatedAt":       timestamp,
                            })
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
                        await db.db.messages.insert_one(message_doc)
                        message_doc["_id"] = str(message_doc.pop("_id"))

                        emit_doc = {
                            **message_doc,
                            "timestamp": timestamp.isoformat(),
                            "createdAt": message_doc["createdAt"].isoformat(),
                        }
                        await sio.emit("message:new", emit_doc, room=conv_id)
                        await sio.emit("conversation:updated", {"conversationId": conv_id})

                # ── Delivery / read statuses ──────────────────────────────────
                elif "statuses" in value:
                    for status in value["statuses"]:
                        message_id  = status.get("id")
                        status_type = status.get("status")
                        await db.db.messages.update_one(
                            {"whatsappMessageId": message_id},
                            {"$set": {"status": status_type, "updatedAt": _now()}},
                        )
                        msg_record = await db.db.messages.find_one(
                            {"whatsappMessageId": message_id}
                        )
                        if msg_record:
                            conv_id = msg_record.get("conversationId")
                            msg_record["_id"] = str(msg_record["_id"])
                            emit_doc = {**msg_record}
                            for key in ("timestamp", "createdAt", "updatedAt"):
                                if key in emit_doc and hasattr(emit_doc[key], "isoformat"):
                                    emit_doc[key] = emit_doc[key].isoformat()
                            await sio.emit("message:status", emit_doc, room=conv_id)
                            await sio.emit("conversation:updated", {"conversationId": conv_id})

    return Response(content="EVENT_RECEIVED", status_code=200)
