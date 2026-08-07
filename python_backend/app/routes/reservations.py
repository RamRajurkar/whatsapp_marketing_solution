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

@router.get("")
@router.get("/")
async def get_reservations(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all captured wholesale product leads & inquiries."""
    tenant_filter = get_tenant_filter(current_user)
    query = {}
    if status and status != "All":
        query["status"] = status
        
    if tenant_filter:
        tenant_id = tenant_filter.get("tenantId")
        if tenant_id:
            tenant_clause = {"$or": [{"tenantId": tenant_id}, {"tenantId": None}, {"tenantId": {"$exists": False}}]}
            if query:
                query = {"$and": [query, tenant_clause]}
            else:
                query = tenant_clause
            
    # Calculate total inquiry count per phone number to alert repeat leads
    phone_counts = {}
    async for r_doc in db.db.reservations.find(query if query else {}):
        ph = str(r_doc.get("phone", "") or r_doc.get("customerPhone", ""))
        if ph:
            phone_counts[ph] = phone_counts.get(ph, 0) + 1

    reservations = []
    cursor = db.db.reservations.find(query).sort("createdAt", -1)
    async for res in cursor:
        res["_id"] = str(res["_id"])

        # Parse Wholesale Lead CRM Fields
        guest_name = str(res.get("guestName", ""))
        date_str = str(res.get("date", ""))
        time_str = str(res.get("time", ""))
        phone = str(res.get("phone", "") or res.get("customerPhone", ""))
        
        # Resolve Customer Profile Name
        customer_name = res.get("customerName")
        if not customer_name or customer_name == phone:
            cust = await db.db.customers.find_one({"phone": phone})
            if cust and cust.get("name") and cust["name"] != phone:
                customer_name = cust["name"]
            else:
                customer_name = guest_name if ("Wholesale Inquiry" not in guest_name and guest_name.strip()) else phone

        # Extract product name
        prod_name = res.get("productName")
        if not prod_name:
            if "Wholesale Inquiry:" in guest_name:
                prod_name = guest_name.split("Wholesale Inquiry:")[1].strip()
            else:
                prod_name = guest_name or "General Product Inquiry"
                
        # Extract style code
        style_code = res.get("styleCode")
        if not style_code:
            if "Code:" in date_str:
                style_code = date_str.split("Code:")[1].strip()
            else:
                style_code = date_str or "N/A"
                
        # Extract quantity range
        qty = res.get("quantityRange") or res.get("guests") or "N/A"
        
        # Extract requirements
        reqs = res.get("requirements")
        if not reqs:
            if "Comments:" in time_str:
                reqs = time_str.split("Comments:")[1].strip()
            else:
                reqs = time_str if time_str != "Now" else "No specific comments"

        created_at = res.get("createdAt")
        if hasattr(created_at, "isoformat"):
            created_at = created_at.isoformat()

        res["customerName"] = customer_name
        res["productName"] = prod_name
        res["styleCode"] = style_code
        res["quantityRange"] = qty
        res["requirements"] = reqs
        res["customerPhone"] = phone
        res["createdAt"] = created_at or _now().isoformat()
        res["inquiryCount"] = phone_counts.get(phone, 1)
        res["isRepeatLead"] = phone_counts.get(phone, 1) > 1
        
        reservations.append(res)

    return {"data": reservations}

@router.patch("/{res_id}/status")
async def update_reservation_status(
    res_id: str,
    data: ReservationStatusUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a lead/reservation status (Pending, Contacted, Confirmed, Completed, Cancelled)."""
    if data.status not in ["Pending", "Contacted", "Confirmed", "Completed", "Cancelled"]:
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
        
        # Dispatch Outbound Lead Status Webhook
        try:
            from app.services.webhook_dispatcher import dispatch_lead_webhook
            await dispatch_lead_webhook(updated_res, event_type="lead.updated", tenant_id=current_user.get("_id"))
        except Exception as wh_err:
            print(f"[Lead Webhook Update Error] {wh_err}")
        
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
