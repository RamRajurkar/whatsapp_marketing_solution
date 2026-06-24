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


@router.post("/")
@router.post("")
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

                        # ── Bot Logic ─────────────────────────────────────────
                        try:
                            bot_settings = await db.db.bot_settings.find_one({})
                            if bot_settings and bot_settings.get("isActive"):
                                import httpx
                                user = await db.db.users.find_one({})
                                wa_token = user.get("waAccessToken") if user else None
                                wa_token = wa_token or settings.WA_ACCESS_TOKEN
                                
                                wa_phone_id = user.get("waPhoneNumberId") if user else None
                                wa_phone_id = wa_phone_id or settings.WA_PHONE_NUMBER_ID
                                
                                api_version = settings.WA_API_VERSION
                                if wa_token and wa_phone_id:
                                    url = f"https://graph.facebook.com/{api_version}/{wa_phone_id}/messages"
                                    headers = {"Authorization": f"Bearer {wa_token}", "Content-Type": "application/json"}
                                    
                                    bot_reply_text = None
                                    payload = None

                                    # 1. Greeting trigger
                                    if msg_type == "text":
                                        lower_text = text_content.lower().strip()
                                        if lower_text in ["hi", "hello", "hey", "start", "menu", "help"]:
                                            bot_reply_text = bot_settings.get("welcomeMessage", "Welcome!")
                                            payload = {
                                                "messaging_product": "whatsapp",
                                                "recipient_type": "individual",
                                                "to": phone_number,
                                                "type": "interactive",
                                                "interactive": {
                                                    "type": "button",
                                                    "body": {"text": bot_reply_text},
                                                    "action": {
                                                        "buttons": [
                                                            {"type": "reply", "reply": {"id": "btn_address", "title": "📍 Address"}},
                                                            {"type": "reply", "reply": {"id": "btn_menu", "title": "📜 Menu"}},
                                                            {"type": "reply", "reply": {"id": "btn_timings", "title": "🕒 Timings"}}
                                                        ]
                                                    }
                                                }
                                            }

                                    # 2. Button click handler
                                    elif msg_type == "interactive":
                                        interactive_data = msg.get("interactive", {})
                                        if interactive_data.get("type") == "button_reply":
                                            btn_id = interactive_data.get("button_reply", {}).get("id")
                                            
                                            if btn_id == "btn_address":
                                                bot_reply_text = bot_settings.get("addressText", "Address not set.")
                                            elif btn_id == "btn_menu":
                                                menu_url = bot_settings.get("menuUrl", "")
                                                bot_reply_text = f"Here is our menu:\n{menu_url}" if menu_url else "Menu not available right now."
                                            elif btn_id == "btn_timings":
                                                bot_reply_text = bot_settings.get("timingsText", "Timings not set.")
                                                
                                            if bot_reply_text:
                                                payload = {
                                                    "messaging_product": "whatsapp",
                                                    "recipient_type": "individual",
                                                    "to": phone_number,
                                                    "type": "text",
                                                    "text": {"preview_url": True, "body": bot_reply_text}
                                                }

                                    # Send the bot response
                                    if payload:
                                        print(f"[BOT] Sending auto-reply to {phone_number}: {bot_reply_text[:50]}...")
                                        async with httpx.AsyncClient(timeout=30.0) as client:
                                            resp = await client.post(url, json=payload, headers=headers)
                                            if resp.status_code in (200, 201):
                                                wa_msg_id = resp.json().get("messages", [{}])[0].get("id", "unknown")
                                                outbound_doc = {
                                                    "conversationId": conv_id,
                                                    "whatsappMessageId": wa_msg_id,
                                                    "direction": "outbound",
                                                    "type": payload["type"],
                                                    "content": {"text": bot_reply_text},
                                                    "status": "sent",
                                                    "timestamp": _now(),
                                                    "createdAt": _now(),
                                                }
                                                await db.db.messages.insert_one(outbound_doc)
                                                
                                                outbound_doc["_id"] = str(outbound_doc["_id"])
                                                outbound_doc["timestamp"] = outbound_doc["timestamp"].isoformat()
                                                outbound_doc["createdAt"] = outbound_doc["createdAt"].isoformat()
                                                
                                                # Emit to frontend
                                                await sio.emit("message:new", outbound_doc, room=conv_id)
                                                
                                                # Update conversation last message
                                                from bson import ObjectId as BsonObjectId
                                                conv_oid = BsonObjectId(conv_id)
                                                await db.db.conversations.update_one(
                                                    {"_id": conv_oid},
                                                    {"$set": {"lastMessage": bot_reply_text, "lastMessageTime": _now()}}
                                                )
                                                await sio.emit("conversation:updated", {"conversationId": conv_id})
                                                print(f"[BOT] Auto-reply sent successfully: {wa_msg_id}")
                                            else:
                                                print(f"[BOT] Auto-reply FAILED: {resp.status_code} {resp.text}")
                        except Exception as bot_err:
                            # Never let bot errors break the webhook — log and continue
                            print(f"[BOT ERROR] {bot_err}")

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
