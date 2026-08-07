import os
import json
import httpx
from typing import Optional, Dict, Any
from app.http_client import get_http_client
from app.database import db
from app.config import settings
from bson import ObjectId

async def dispatch_lead_webhook(
    lead_doc: dict, 
    event_type: str = "lead.product_inquiry",
    inquiry_type: str = "product_inquiry",
    tenant_id: Optional[str] = None,
    override_webhook_url: Optional[str] = None
):
    """
    Asynchronously dispatch structured lead JSON payload to external CRM / Dashboard webhook endpoint.
    Supports 3 inquiry types: 'catalog_inquiry', 'product_inquiry', 'support_request'.
    """
    try:
        # 1. Resolve Outbound Webhook URL
        webhook_url = override_webhook_url or os.getenv("OUTBOUND_LEADS_WEBHOOK_URL")
        
        if not webhook_url and tenant_id:
            try:
                user = await db.db.users.find_one({"_id": ObjectId(tenant_id)})
            except Exception:
                user = await db.db.users.find_one({"_id": tenant_id})
            if user and user.get("leadsWebhookUrl"):
                webhook_url = user.get("leadsWebhookUrl")
        
        if not webhook_url:
            user = await db.db.users.find_one({})
            if user and user.get("leadsWebhookUrl"):
                webhook_url = user.get("leadsWebhookUrl")

        if not webhook_url or not str(webhook_url).startswith("http"):
            print(f"[Lead Webhook] No valid webhook URL configured ({webhook_url}). Skipping dispatch.")
            return {"success": False, "error": "No valid webhook URL provided"}

        # 2. Format ISO timestamp
        created_at_str = lead_doc.get("createdAt")
        if hasattr(created_at_str, "isoformat"):
            created_at_str = created_at_str.isoformat()
        else:
            created_at_str = str(created_at_str or "")

        # 3. Resolve inquiry details based on inquiry_type
        cust_name = lead_doc.get("customerName") or lead_doc.get("guestName") or lead_doc.get("name") or "Unknown"
        cust_phone = lead_doc.get("customerPhone") or lead_doc.get("phone") or ""

        if inquiry_type == "catalog_inquiry":
            evt_name = "lead.catalog_inquiry"
            inquiry_details = {
                "category": "Catalog View",
                "catalogUrl": lead_doc.get("catalogUrl") or lead_doc.get("url") or "http://localhost/menu",
                "notes": lead_doc.get("notes") or "Customer requested digital fabric & design catalog via WhatsApp"
            }
            status_val = lead_doc.get("status", "New")

        elif inquiry_type == "support_request":
            evt_name = "lead.support_request"
            inquiry_details = {
                "category": "Customer Support & Direct Contact",
                "supportTopic": lead_doc.get("topic") or "Human Sales Representative Needed",
                "issueDescription": lead_doc.get("issueDescription") or lead_doc.get("comments") or "Customer requested to speak with sales representative regarding bulk orders",
                "priority": lead_doc.get("priority", "High")
            }
            status_val = lead_doc.get("status", "Open")

        else: # Default: product_inquiry
            evt_name = "lead.product_inquiry"
            inquiry_details = {
                "category": "Product Wholesale Order",
                "productName": lead_doc.get("productName") or "Wholesale Cotton Fabrics",
                "styleCode": lead_doc.get("styleCode") or lead_doc.get("product_code") or "N/A",
                "quantityRange": lead_doc.get("quantityRange") or lead_doc.get("guests") or "N/A",
                "requirements": lead_doc.get("requirements") or lead_doc.get("time") or "No specific notes"
            }
            status_val = lead_doc.get("status", "Pending")

        # 4. Construct standardized CRM Lead Webhook Payload
        payload = {
            "event": evt_name,
            "inquiryType": inquiry_type,
            "businessType": "wholesale",
            "channel": "whatsapp_wholesale",
            "leadId": str(lead_doc.get("_id", "")),
            "customer": {
                "name": cust_name,
                "phone": cust_phone
            },
            "inquiry": inquiry_details,
            "status": status_val,
            "createdAt": created_at_str,
            "tenantId": str(tenant_id) if tenant_id else str(lead_doc.get("tenantId", ""))
        }

        headers = {
            "Content-Type": "application/json",
            "User-Agent": "BlackAngler-WhatsApp-CRM-Webhook/1.0"
        }

        client = get_http_client()
        try:
            resp = await client.post(webhook_url, json=payload, headers=headers, timeout=8.0)
            print(f"[Lead Webhook SUCCESS] Dispatched '{evt_name}' ({inquiry_type}) to {webhook_url} | Status: {resp.status_code}")
            return {"success": True, "status_code": resp.status_code, "payload": payload}
        except Exception as http_err:
            print(f"[Lead Webhook HTTP Connection Error] {http_err}")
            return {"success": False, "error": f"Failed to connect to webhook URL: {http_err}", "payload": payload}

    except Exception as e:
        print(f"[Lead Webhook ERROR] Failed to dispatch webhook: {e}")
        return {"success": False, "error": str(e)}
