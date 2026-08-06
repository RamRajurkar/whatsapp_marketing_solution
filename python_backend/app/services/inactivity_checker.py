import asyncio
from datetime import datetime, timezone
from bson import ObjectId
from app.database import db
from app.config import settings
from app.services.bot_executor import _get_wa_credentials, _send_whatsapp_payload, _save_bot_message

async def check_inactive_sessions():
    """Periodically check for inactive sessions and handle reminders / auto-closes."""
    try:
        now = datetime.now(timezone.utc)
        
        # 1. Fetch all customer sessions
        cursor = db.db.customer_sessions.find({})
        async for session in cursor:
            phone_number = session.get("phone")
            tenant_id = session.get("tenantId")
            updated_at = session.get("updatedAt")
            
            if not phone_number or not updated_at:
                continue
                
            # Ensure updatedAt has UTC timezone info
            if updated_at.tzinfo is None:
                updated_at = updated_at.replace(tzinfo=timezone.utc)
                
            elapsed_seconds = (now - updated_at).total_seconds()
            
            # 2. Check if this conversation is waiting for a human agent (i.e. has an Open support ticket)
            open_ticket = await db.db.support_tickets.find_one({
                "customerPhone": phone_number,
                "status": "Open"
            })
            if open_ticket:
                # Do not trigger inactivity timer: let support workflow take over
                continue
                
            # Fetch WA credentials and business name
            wa_token, wa_phone_id, business_name = await _get_wa_credentials(tenant_id)
            if not wa_token or not wa_phone_id:
                continue
                
            # Find the conversation ID to log bot messages
            conv_query = {"customerPhone": phone_number}
            if tenant_id:
                conv_query["tenantId"] = tenant_id
            conv_doc = await db.db.conversations.find_one(conv_query)
            conv_id = str(conv_doc["_id"]) if conv_doc else "unknown"
            
            # 3. Auto Close (After 20 minutes = 1200 seconds of inactivity)
            if elapsed_seconds >= 1200:
                close_text = (
                    f"Thanks for contacting {business_name}! 😊\n\n"
                    "Since we haven't heard back from you, we've ended this conversation for now.\n\n"
                    "Whenever you need assistance again, simply send \"Hi\" to start a new chat."
                )
                payload = {
                    "messaging_product": "whatsapp",
                    "recipient_type": "individual",
                    "to": phone_number,
                    "type": "text",
                    "text": {"preview_url": False, "body": close_text}
                }
                
                try:
                    wa_msg_id = await _send_whatsapp_payload(wa_phone_id, wa_token, payload)
                    if conv_id != "unknown":
                        await _save_bot_message(conv_id, wa_msg_id, "outbound", "text", close_text, tenant_id)
                        # Mark conversation as closed in database
                        await db.db.conversations.update_one(
                            {"_id": conv_doc["_id"]},
                            {"$set": {"status": "closed", "updatedAt": now}}
                        )
                except Exception as send_err:
                    print(f"[Inactivity Checker] Error sending close message: {send_err}")
                
                # Delete session and reset chatbot to main menu
                await db.db.customer_sessions.delete_one({"_id": session["_id"]})
                print(f"[Inactivity Checker] Auto closed session for {phone_number} after 20 minutes.")
                
            # 4. 1st Reminder (After 5 minutes = 300 seconds of inactivity)
            elif elapsed_seconds >= 300:
                # Check if reminder has already been sent
                if session.get("reminderSent"):
                    continue
                    
                reminder_text = (
                    "Just checking in 😊\n\n"
                    "We're still waiting for your response.\n\n"
                    "If you need any assistance, simply reply to this message."
                )
                payload = {
                    "messaging_product": "whatsapp",
                    "recipient_type": "individual",
                    "to": phone_number,
                    "type": "text",
                    "text": {"preview_url": False, "body": reminder_text}
                }
                
                try:
                    wa_msg_id = await _send_whatsapp_payload(wa_phone_id, wa_token, payload)
                    if conv_id != "unknown":
                        await _save_bot_message(conv_id, wa_msg_id, "outbound", "text", reminder_text, tenant_id)
                except Exception as send_err:
                    print(f"[Inactivity Checker] Error sending reminder message: {send_err}")
                    
                # Mark reminder as sent
                await db.db.customer_sessions.update_one(
                    {"_id": session["_id"]},
                    {"$set": {"reminderSent": True}}
                )
                print(f"[Inactivity Checker] Sent inactivity reminder to {phone_number} after 5 minutes.")
                
    except Exception as err:
        print(f"[Inactivity Checker Error] {err}")

async def inactivity_checker_loop():
    """Background task loop running every 30 seconds."""
    # Wait for MongoDB to connect at startup
    await asyncio.sleep(10)
    print("[Inactivity Checker] Background loop started.")
    while True:
        try:
            await check_inactive_sessions()
        except Exception as loop_err:
            print(f"[Inactivity Checker Loop Error] {loop_err}")
        await asyncio.sleep(30)
