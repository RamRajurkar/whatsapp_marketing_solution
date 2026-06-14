from fastapi import APIRouter, Request, Response, HTTPException
from app.database import db
from app.socket import sio
from app.utils.phone import normalize_indian_phone
from app.config import settings
from datetime import datetime

router = APIRouter()

@router.get("/")
async def verify_webhook(request: Request):
    """Handle Meta webhook verification"""
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    if mode and token:
        # Check against the admin user's verify token or the global settings token
        admin = await db.db.users.find_one({"email": "admin@restaurant.com"})
        
        valid_token = None
        if admin and admin.get("waVerifyToken"):
            valid_token = admin.get("waVerifyToken")
        else:
            valid_token = settings.WA_VERIFY_TOKEN
            
        if valid_token == token:
            return Response(content=challenge, status_code=200)
        else:
            raise HTTPException(status_code=403, detail="Forbidden")
    raise HTTPException(status_code=400, detail="Bad Request")

@router.post("/")
async def receive_webhook(request: Request):
    """Handle incoming messages and statuses from WhatsApp"""
    body = await request.json()
    
    if body.get("object") == "whatsapp_business_account":
        for entry in body.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                
                # Handle messages
                if "messages" in value:
                    for msg in value["messages"]:
                        contact = value["contacts"][0] if "contacts" in value else {}
                        phone_number = msg.get("from")
                        # Normalize to Indian format (91XXXXXXXXXX)
                        try:
                            phone_number = normalize_indian_phone(phone_number)
                        except ValueError:
                            pass  # Keep original if normalization fails
                        customer_name = contact.get("profile", {}).get("name", "Unknown")
                        message_id = msg.get("id")
                        timestamp = datetime.utcfromtimestamp(int(msg.get("timestamp", datetime.utcnow().timestamp())))
                        msg_type = msg.get("type")
                        
                        text_content = msg.get("text", {}).get("body", "") if msg_type == "text" else f"[{msg_type} message]"
                        
                        # Find or create conversation
                        conversation = await db.db.conversations.find_one({"customerPhone": phone_number})
                        
                        if not conversation:
                            # Create new conversation
                            result = await db.db.conversations.insert_one({
                                "customerPhone": phone_number,
                                "customerName": customer_name,
                                "lastMessage": text_content,
                                "lastMessageTime": timestamp,
                                "unreadCount": 1,
                                "status": "active",
                                "createdAt": datetime.utcnow(),
                                "updatedAt": timestamp
                            })
                            conv_id = str(result.inserted_id)
                        else:
                            conv_id = str(conversation["_id"])
                            await db.db.conversations.update_one(
                                {"_id": conversation["_id"]},
                                {
                                    "$set": {
                                        "lastMessage": text_content,
                                        "lastMessageTime": timestamp,
                                        "customerName": customer_name,
                                        "updatedAt": datetime.utcnow()
                                    },
                                    "$inc": {"unreadCount": 1}
                                }
                            )
                            
                        # Save message
                        message_doc = {
                            "conversationId": conv_id,
                            "whatsappMessageId": message_id,
                            "direction": "inbound",
                            "type": msg_type,
                            "content": {"text": text_content},
                            "status": "delivered",
                            "timestamp": timestamp,
                            "createdAt": datetime.utcnow()
                        }
                        await db.db.messages.insert_one(message_doc)
                        
                        message_doc["_id"] = str(message_doc.pop("_id"))
                        
                        # Emit socket events
                        emit_doc = {**message_doc, "timestamp": timestamp.isoformat(), "createdAt": message_doc["createdAt"].isoformat()}
                        await sio.emit("message:new", emit_doc, room=conv_id)
                        await sio.emit("conversation:updated", {"conversationId": conv_id})
                        
                # Handle message statuses (read, delivered, failed)
                elif "statuses" in value:
                    for status in value["statuses"]:
                        message_id = status.get("id")
                        status_type = status.get("status")
                        await db.db.messages.update_one(
                            {"whatsappMessageId": message_id},
                            {"$set": {"status": status_type, "updatedAt": datetime.utcnow()}}
                        )
                        # Emit event if message found
                        msg_record = await db.db.messages.find_one({"whatsappMessageId": message_id})
                        if msg_record:
                            conv_id = msg_record.get("conversationId")
                            msg_record["_id"] = str(msg_record["_id"])
                            emit_doc = {**msg_record}
                            if "timestamp" in emit_doc and hasattr(emit_doc["timestamp"], "isoformat"):
                                emit_doc["timestamp"] = emit_doc["timestamp"].isoformat()
                            if "createdAt" in emit_doc and hasattr(emit_doc["createdAt"], "isoformat"):
                                emit_doc["createdAt"] = emit_doc["createdAt"].isoformat()
                            if "updatedAt" in emit_doc and hasattr(emit_doc["updatedAt"], "isoformat"):
                                emit_doc["updatedAt"] = emit_doc["updatedAt"].isoformat()
                            await sio.emit("message:new", emit_doc, room=conv_id)
                            await sio.emit("conversation:updated", {"conversationId": conv_id})

    return Response(content="EVENT_RECEIVED", status_code=200)
