from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, List
from pydantic import BaseModel
from app.routes.auth import get_current_user
from app.database import db
from app.config import settings
from bson import ObjectId
from datetime import datetime
import httpx
import asyncio

router = APIRouter()


class BroadcastCreate(BaseModel):
    name: str
    templateName: str
    templateLanguage: str = "en"
    audienceTags: Optional[List[str]] = []
    scheduledAt: Optional[str] = None
    status: str = "draft"


@router.get("/")
async def get_broadcasts(current_user: dict = Depends(get_current_user)):
    """Get all broadcast campaigns."""
    cursor = db.db.broadcasts.find().sort("createdAt", -1)
    broadcasts = await cursor.to_list(length=100)
    for b in broadcasts:
        b["_id"] = str(b["_id"])
    return broadcasts


@router.post("/")
async def create_broadcast(data: BroadcastCreate, current_user: dict = Depends(get_current_user)):
    """Create a new broadcast campaign."""
    doc = data.model_dump()
    doc["createdAt"] = datetime.utcnow()
    doc["updatedAt"] = datetime.utcnow()
    doc["stats"] = {"total": 0, "sent": 0, "failed": 0}

    result = await db.db.broadcasts.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


@router.delete("/{broadcast_id}")
async def delete_broadcast(broadcast_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a broadcast campaign."""
    try:
        obj_id = ObjectId(broadcast_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid broadcast ID")

    result = await db.db.broadcasts.delete_one({"_id": obj_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    return {"message": "Broadcast deleted"}


@router.post("/{broadcast_id}/send")
async def send_broadcast(broadcast_id: str, current_user: dict = Depends(get_current_user)):
    """Send a broadcast campaign to target audience via WhatsApp template messages."""
    try:
        obj_id = ObjectId(broadcast_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid broadcast ID")

    broadcast = await db.db.broadcasts.find_one({"_id": obj_id})
    if not broadcast:
        raise HTTPException(status_code=404, detail="Broadcast not found")

    if broadcast.get("status") not in ("draft", "failed"):
        raise HTTPException(status_code=400, detail="Broadcast has already been sent or is sending")

    # Get WA credentials from user
    wa_phone_id = current_user.get("waPhoneNumberId") or settings.WA_PHONE_NUMBER_ID
    wa_token = current_user.get("waAccessToken") or settings.WA_ACCESS_TOKEN

    if not wa_phone_id or not wa_token:
        raise HTTPException(status_code=400, detail="WhatsApp credentials not configured. Go to Settings.")

    # Find target customers
    customer_query = {}
    audience_tags = broadcast.get("audienceTags", [])
    if audience_tags:
        customer_query = {"tags": {"$in": audience_tags}}

    customers = await db.db.customers.find(customer_query).to_list(length=10000)

    if not customers:
        raise HTTPException(status_code=400, detail="No customers found for the selected audience")

    # Update status to sending
    await db.db.broadcasts.update_one(
        {"_id": obj_id},
        {"$set": {
            "status": "sending",
            "stats.total": len(customers),
            "updatedAt": datetime.utcnow()
        }}
    )

    # Send template messages
    sent_count = 0
    failed_count = 0
    template_name = broadcast["templateName"]
    template_lang = broadcast.get("templateLanguage", "en")

    if wa_token == "test_token":
        for customer in customers:
            phone = customer.get("phone", "")
            if not phone:
                failed_count += 1
                continue
            
            sent_count += 1
            wa_msg_id = f"mock_bc_{int(datetime.utcnow().timestamp())}_{sent_count}"
            await _save_outbound_template_message(
                customer, wa_msg_id, template_name, broadcast_id
            )
            await asyncio.sleep(0.05)
    else:
        async with httpx.AsyncClient(timeout=30.0) as client:
            for customer in customers:
                phone = customer.get("phone", "")
                if not phone:
                    failed_count += 1
                    continue
    
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
                        "name": template_name,
                        "language": {"code": template_lang}
                    }
                }
    
                try:
                    resp = await client.post(url, json=payload, headers=headers)
                    if resp.status_code in (200, 201):
                        sent_count += 1
                        # Save outbound message record
                        msg_data = resp.json()
                        wa_msg_id = msg_data.get("messages", [{}])[0].get("id", "unknown")
                        await _save_outbound_template_message(
                            customer, wa_msg_id, template_name, broadcast_id
                        )
                    else:
                        failed_count += 1
                        print(f"Failed to send to {phone}: {resp.text}")
                except Exception as e:
                    failed_count += 1
                    print(f"Error sending to {phone}: {e}")
    
                # Brief pause to avoid rate limits
                await asyncio.sleep(0.1)

    # Update broadcast with final stats
    final_status = "sent" if failed_count == 0 else ("failed" if sent_count == 0 else "sent")
    await db.db.broadcasts.update_one(
        {"_id": obj_id},
        {"$set": {
            "status": final_status,
            "stats.sent": sent_count,
            "stats.failed": failed_count,
            "sentAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow()
        }}
    )

    return {
        "message": f"Broadcast sent: {sent_count} delivered, {failed_count} failed",
        "sent": sent_count,
        "failed": failed_count,
        "total": len(customers)
    }


async def _save_outbound_template_message(customer: dict, wa_msg_id: str, template_name: str, broadcast_id: str):
    """Save an outbound template message and create/update the conversation."""
    phone = customer.get("phone", "")
    name = customer.get("name", phone)
    now = datetime.utcnow()

    # Find or create conversation
    conversation = await db.db.conversations.find_one({"customerPhone": phone})
    if not conversation:
        conv_doc = {
            "customerPhone": phone,
            "customerName": name,
            "lastMessage": f"[Template: {template_name}]",
            "lastMessageTime": now,
            "unreadCount": 0,
            "createdAt": now,
            "updatedAt": now,
        }
        result = await db.db.conversations.insert_one(conv_doc)
        conv_id = str(result.inserted_id)
    else:
        conv_id = str(conversation["_id"])
        await db.db.conversations.update_one(
            {"_id": conversation["_id"]},
            {"$set": {
                "lastMessage": f"[Template: {template_name}]",
                "lastMessageTime": now,
                "updatedAt": now
            }}
        )

    # Save message
    msg_doc = {
        "conversationId": conv_id,
        "whatsappMessageId": wa_msg_id,
        "direction": "outbound",
        "type": "template",
        "content": {"text": f"[Template: {template_name}]", "templateName": template_name},
        "status": "sent",
        "broadcastId": broadcast_id,
        "timestamp": now,
        "createdAt": now,
    }
    await db.db.messages.insert_one(msg_doc)
