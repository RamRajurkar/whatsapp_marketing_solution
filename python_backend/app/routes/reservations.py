from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from app.routes.auth import get_current_user
from app.database import db
from bson import ObjectId
from datetime import datetime, timezone
from app.config import settings
from app.http_client import get_http_client
from app.utils.tenant import get_tenant_filter, inject_tenant_id
import httpx

router = APIRouter()

class ReservationStatusUpdate(BaseModel):
    status: str

@router.get("/")
async def get_reservations(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all bookings, optionally filtered by status."""
    tenant_filter = get_tenant_filter(current_user)
    query = {}
    if status and status != "All":
        query["status"] = status
        
    if tenant_filter:
        if query:
            query = {"$and": [query, tenant_filter]}
        else:
            query = tenant_filter
            
    reservations = []
    cursor = db.db.reservations.find(query).sort("createdAt", -1)
    async for res in cursor:
        res["_id"] = str(res["_id"])
        reservations.append(res)
    return {"data": reservations}

@router.patch("/{res_id}/status")
async def update_reservation_status(
    res_id: str,
    data: ReservationStatusUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a reservation status (Pending, Confirmed, Cancelled, Completed)."""
    if data.status not in ["Pending", "Confirmed", "Cancelled", "Completed"]:
        raise HTTPException(status_code=400, detail="Invalid status")
        
    tenant_filter = get_tenant_filter(current_user)
    query = {"_id": ObjectId(res_id)}
    if tenant_filter:
        query = {"$and": [query, tenant_filter]}

    result = await db.db.reservations.update_one(
        query,
        {"$set": {"status": data.status, "updatedAt": datetime.now(timezone.utc)}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Reservation not found")
        
    updated_res = await db.db.reservations.find_one(query)
    if updated_res:
        updated_res["_id"] = str(updated_res["_id"])
        
        # Trigger feedback message if completed
        if data.status == "Completed":
            wa_token = current_user.get("waAccessToken") or settings.WA_ACCESS_TOKEN
            wa_phone_id = current_user.get("waPhoneNumberId") or settings.WA_PHONE_NUMBER_ID
            api_version = settings.WA_API_VERSION
            
            if wa_token and wa_phone_id:
                url = f"https://graph.facebook.com/{api_version}/{wa_phone_id}/messages"
                headers = {"Authorization": f"Bearer {wa_token}", "Content-Type": "application/json"}
                
                name = updated_res.get("guestName", "Guest").split(" ")[0]
                feedback_msg = f"Hi {name}! 😊 Thank you for your visit!\nHow was your experience? Reply with:\n1 ⭐ - Poor\n2 ⭐⭐⭐ - Good\n3 ⭐⭐⭐⭐⭐ - Excellent"
                
                payload = {
                    "messaging_product": "whatsapp",
                    "recipient_type": "individual",
                    "to": updated_res["phone"],
                    "type": "text",
                    "text": {"preview_url": False, "body": feedback_msg}
                }
                
                client = get_http_client()
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code in (200, 201):
                    # Save feedback state with tenant isolation
                    fb_doc = {"reservationId": res_id, "updatedAt": datetime.now(timezone.utc)}
                    inject_tenant_id(fb_doc, current_user)
                    
                    await db.db.feedback_states.update_one(
                        {"phone": updated_res["phone"]},
                        {"$set": fb_doc},
                        upsert=True
                    )

    return {"message": "Status updated", "data": updated_res}

@router.delete("/{res_id}")
async def delete_reservation(
    res_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a reservation."""
    tenant_filter = get_tenant_filter(current_user)
    query = {"_id": ObjectId(res_id)}
    if tenant_filter:
        query = {"$and": [query, tenant_filter]}

    result = await db.db.reservations.delete_one(query)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Reservation not found")
    return {"message": "Reservation deleted"}
