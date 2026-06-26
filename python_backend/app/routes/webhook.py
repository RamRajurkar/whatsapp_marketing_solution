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

                    results["messages_processed"] += 1

                    # ── Bot Logic ─────────────────────────────────────────
                    try:
                        bot_reply = await _run_bot_logic(msg, msg_type, text_content, phone_number, conv_id)
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
                    await db.db.messages.update_one(
                        {"whatsappMessageId": status_msg_id},
                        {"$set": {"status": status_type, "updatedAt": _now()}},
                    )
                    msg_record = await db.db.messages.find_one(
                        {"whatsappMessageId": status_msg_id}
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
                    results["statuses_processed"] += 1

    return results


async def _run_bot_logic(msg: dict, msg_type: str, text_content: str, phone_number: str, conv_id: str) -> Optional[dict]:
    """
    Execute chatbot auto-reply logic for an incoming message.
    Returns a result dict if a reply was sent, or None if no reply was triggered.
    """
    import asyncio
    bot_settings, user, fb_state, state_doc = await asyncio.gather(
        get_bot_settings(db.db),
        db.db.users.find_one({}),
        db.db.feedback_states.find_one({"phone": phone_number}),
        db.db.reservation_states.find_one({"phone": phone_number})
    )

    if not bot_settings or not bot_settings.get("isActive"):
        return None
    wa_token    = (user.get("waAccessToken") if user else None) or settings.WA_ACCESS_TOKEN
    wa_phone_id = (user.get("waPhoneNumberId") if user else None) or settings.WA_PHONE_NUMBER_ID
    api_version = settings.WA_API_VERSION

    if not wa_token or not wa_phone_id:
        return None

    url     = f"https://graph.facebook.com/{api_version}/{wa_phone_id}/messages"
    headers = {"Authorization": f"Bearer {wa_token}", "Content-Type": "application/json"}

    bot_reply_text = None
    payload = None

    INTENT_GROUPS = {
        "greeting": ["hi", "hello", "hey", "start", "help", "hii", "helo",
                     "namaste", "namaskar", "kem cho", "kya hal", "good morning",
                     "good evening", "good afternoon", "sup", "yo"],
        "menu":     ["menu", "food", "kya hai", "what do you have", "show menu",
                     "items", "dishes", "khana", "what's available", "card"],
        "timings":  ["timing", "timings", "open", "close", "hours", "time",
                     "kab", "kitne baje", "when", "schedule"],
        "address":  ["address", "location", "where", "kahan", "directions",
                     "map", "place", "how to reach", "locate"],
        "booking":  ["book", "reservation", "table", "reserve", "seat",
                     "booking", "jagah", "place a booking"]
    }

    # Check for active feedback state
    if fb_state and msg_type == "text":
        text_val = text_content.strip()
        rating = None
        if text_val in ["1", "2", "3"]:
            rating = int(text_val)
        
        if rating:
            res_id = fb_state.get("reservationId")
            await db.db.feedback.insert_one({
                "reservationId": res_id,
                "phone": phone_number,
                "rating": rating,
                "createdAt": _now()
            })
            await db.db.feedback_states.delete_one({"_id": fb_state["_id"]})
            
            bot_reply_text = "Thank you for your valuable feedback! 🙏 Hope to see you again soon."
            payload = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": phone_number,
                "type": "text",
                "text": {"preview_url": False, "body": bot_reply_text}
            }
            # We skip normal logic by returning here since we handled it
            # But we must send the message first
            client = get_http_client()
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code in (200, 201):
                wa_msg_id = resp.json().get("messages", [{}])[0].get("id", "unknown")
                outbound_doc = {
                    "conversationId": conv_id,
                    "whatsappMessageId": wa_msg_id,
                    "direction": "outbound",
                    "type": "text",
                    "content": {"text": bot_reply_text},
                    "status": "sent",
                    "timestamp": _now(),
                    "createdAt": _now(),
                }
                await db.db.messages.insert_one(outbound_doc)
                outbound_doc["_id"] = str(outbound_doc["_id"])
                outbound_doc["timestamp"] = outbound_doc["timestamp"].isoformat()
                outbound_doc["createdAt"] = outbound_doc["createdAt"].isoformat()
                await sio.emit("message:new", outbound_doc, room=conv_id)
            return {"to": phone_number, "text": bot_reply_text, "type": "feedback"}
            
    # Check for active reservation state
    if state_doc and msg_type == "text":
        step = state_doc.get("step")
        text_val = text_content.strip()
        
        if step == "ask_guests":
            await db.db.reservation_states.update_one(
                {"_id": state_doc["_id"]},
                {"$set": {"step": "ask_date", "guests": text_val, "updatedAt": _now()}}
            )
            bot_reply_text = "What date would you like? 📅 (e.g. 25 June)"
            payload = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": phone_number,
                "type": "text",
                "text": {"preview_url": False, "body": bot_reply_text}
            }
        elif step == "ask_date":
            await db.db.reservation_states.update_one(
                {"_id": state_doc["_id"]},
                {"$set": {"step": "ask_time", "date": text_val, "updatedAt": _now()}}
            )
            bot_reply_text = "What time would you prefer? 🕒 (e.g. 7:30 PM)"
            payload = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": phone_number,
                "type": "text",
                "text": {"preview_url": False, "body": bot_reply_text}
            }
        elif step == "ask_time":
            guests = state_doc.get("guests", "Unknown")
            date_val = state_doc.get("date", "Unknown")
            time_val = text_val
            
            conv = await db.db.conversations.find_one({"customerPhone": phone_number})
            cust_name = conv.get("customerName", phone_number) if conv else phone_number
            
            reservation = {
                "guestName": cust_name,
                "phone": phone_number,
                "guests": guests,
                "date": date_val,
                "time": time_val,
                "status": "Pending",
                "createdAt": _now(),
                "updatedAt": _now()
            }
            res_result = await db.db.reservations.insert_one(reservation)
            
            await db.db.reservation_states.delete_one({"_id": state_doc["_id"]})
            
            bot_reply_text = f"✅ Reservation request received!\n👥 {guests} people | 📅 {date_val} | 🕒 {time_val}\nWe'll confirm within 15 minutes."
            payload = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": phone_number,
                "type": "text",
                "text": {"preview_url": False, "body": bot_reply_text}
            }
            
            res_emit = {**reservation, "_id": str(res_result.inserted_id), "createdAt": reservation["createdAt"].isoformat(), "updatedAt": reservation["updatedAt"].isoformat()}
            await sio.emit("reservation:new", res_emit)

    # If not in reservation state, do standard intent matching
    elif msg_type == "text":
        lower_text = text_content.lower().strip()
        
        # 1. First check FAQ items
        faq_cursor = db.db.faq_items.find({"isActive": True})
        matched_faq = None
        async for faq in faq_cursor:
            if any(keyword in lower_text for keyword in faq.get("keywords", [])):
                matched_faq = faq
                break
                
        if matched_faq:
            bot_reply_text = matched_faq.get("answer", "")
            payload = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": phone_number,
                "type": "text",
                "text": {"preview_url": False, "body": bot_reply_text}
            }
        else:
            # 2. If no FAQ match, check standard intents
            intent = None
            for key, keywords in INTENT_GROUPS.items():
                if any(keyword in lower_text for keyword in keywords):
                    intent = key
                    break
                    
            if intent == "greeting":
                IST = pytz.timezone("Asia/Kolkata")
                current_hour = datetime.now(IST).hour
                open_hour = bot_settings.get("openHour", 11)
                close_hour = bot_settings.get("closeHour", 23)
                
                if current_hour >= close_hour or current_hour < open_hour:
                    closed_msg = f"😴 We're currently closed. We open at {open_hour}:00. Leave your message and we'll get back to you!"
                    payload = {
                        "messaging_product": "whatsapp",
                        "recipient_type": "individual",
                        "to": phone_number,
                        "type": "text",
                        "text": {"preview_url": False, "body": closed_msg}
                    }
                    bot_reply_text = closed_msg
                else:
                    if 11 <= current_hour < 15:
                        time_prefix = "🍽️ We're open for lunch! "
                    elif 19 <= current_hour < 23:
                        time_prefix = "🌙 We're open for dinner! "
                    else:
                        time_prefix = "👋 Hello! "
                        
                    base_welcome = bot_settings.get("welcomeMessage", "Welcome!")
                    bot_reply_text = f"{time_prefix}\n{base_welcome}"
                    
                    buttons = [
                        {"id": "btn_address", "title": "📍 Address"},
                        {"id": "btn_menu", "title": "📜 Menu"},
                        {"id": "btn_timings", "title": "🕒 Timings"}
                    ]
                    payload = get_greeting_payload(phone_number, bot_reply_text, buttons)
            elif intent == "menu":
                menu_url = bot_settings.get("menuUrl", "")
                bot_reply_text = f"Here is our menu:\n{menu_url}" if menu_url else "Menu not available right now."
                payload = {
                    "messaging_product": "whatsapp",
                    "recipient_type": "individual",
                    "to": phone_number,
                    "type": "text",
                    "text": {"preview_url": True, "body": bot_reply_text}
                }
            elif intent == "timings":
                bot_reply_text = bot_settings.get("timingsText", "Timings not set.")
                payload = {
                    "messaging_product": "whatsapp",
                    "recipient_type": "individual",
                    "to": phone_number,
                    "type": "text",
                    "text": {"preview_url": True, "body": bot_reply_text}
                }
            elif intent == "address":
                bot_reply_text = bot_settings.get("addressText", "Address not set.")
                payload = {
                    "messaging_product": "whatsapp",
                    "recipient_type": "individual",
                    "to": phone_number,
                    "type": "text",
                    "text": {"preview_url": True, "body": bot_reply_text}
                }
            elif intent == "booking":
                await db.db.reservation_states.update_one(
                    {"phone": phone_number},
                    {"$set": {"step": "ask_guests", "updatedAt": _now()}},
                    upsert=True
                )
                bot_reply_text = "Let's get your table booked! How many people will be dining? 👥 (Reply with a number)"
                payload = {
                    "messaging_product": "whatsapp",
                    "recipient_type": "individual",
                    "to": phone_number,
                    "type": "text",
                    "text": {"preview_url": False, "body": bot_reply_text}
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
    if not payload:
        return None

    print(f"[BOT] Sending auto-reply to {phone_number}: {bot_reply_text[:50]}...")
    client = get_http_client()
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
        conv_oid = ObjectId(conv_id)
        await db.db.conversations.update_one(
            {"_id": conv_oid},
            {"$set": {"lastMessage": bot_reply_text, "lastMessageTime": _now()}}
        )
        await sio.emit("conversation:updated", {"conversationId": conv_id})
        print(f"[BOT] Auto-reply sent successfully: {wa_msg_id}")
        return {"to": phone_number, "text": bot_reply_text, "wa_msg_id": wa_msg_id}
    else:
        print(f"[BOT] Auto-reply FAILED: {resp.status_code} {resp.text}")
        return {"to": phone_number, "text": bot_reply_text, "error": resp.text}


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
