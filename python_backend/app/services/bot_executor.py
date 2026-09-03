import re
import os
import json
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple, Dict, Any
from bson import ObjectId

from app.database import db
from app.config import settings
from app.http_client import get_http_client
from app.socket import sio

# Constants
SESSION_TIMEOUT_MINUTES = 15

def _now():
    return datetime.now(timezone.utc)

def _format_text(text: str, context: dict, business_name: str) -> str:
    """Safe placeholder replacement in message templates."""
    formatted = text
    # Default tags
    vars_map = {
        "business_name": business_name,
        **context
    }
    for k, v in vars_map.items():
        formatted = formatted.replace(f"{{{k}}}", str(v))
    return formatted

def _validate_input(text: str, validation: dict) -> bool:
    """Validate customer text replies against flow schema rules."""
    if not validation:
        return True
        
    val_type = validation.get("type", "text")
    clean_text = text.strip()
    
    if val_type == "number":
        if not clean_text.isdigit():
            return False
        val = int(clean_text)
        return val >= 1 and val <= 10000
    elif val_type == "phone":
        digits = re.sub(r"\D", "", clean_text)
        return len(digits) >= 10 and len(digits) <= 15
    elif val_type == "email":
        return "@" in clean_text and "." in clean_text
    elif val_type == "regex":
        pattern = validation.get("pattern", ".*")
        try:
            return bool(re.match(pattern, clean_text, re.IGNORECASE))
        except Exception:
            return False
    return True

async def _get_wa_credentials(tenant_id: Optional[str]) -> Tuple[str, str, str]:
    """Fetch WA Access Token, Phone ID, and Business Name for the corresponding tenant."""
    # Default settings
    wa_token = settings.WA_ACCESS_TOKEN
    wa_phone_id = settings.WA_PHONE_NUMBER_ID
    business_name = "Our Business"
    
    if tenant_id and getattr(settings, "APP_MODE", "self_hosted") == "saas":
        # 1. First look in wa_connections for vaulted encrypted credentials
        from app.utils.crypto_vault import crypto_vault
        conn = await db.db.wa_connections.find_one({"tenantId": tenant_id})
        if conn and conn.get("accessTokenEncrypted"):
            try:
                wa_token = crypto_vault.decrypt_secret(conn["accessTokenEncrypted"])
                wa_phone_id = conn.get("phoneNumberId") or wa_phone_id
            except Exception as e:
                print(f"[Bot Executor] Error decrypting tenant access token: {e}")

        # 2. Lookup tenant business name
        try:
            tenant = await db.db.tenants.find_one({"_id": ObjectId(tenant_id)})
            if tenant:
                business_name = tenant.get("name") or business_name
        except Exception:
            pass
        if business_name == "Our Business":
            user = await db.db.users.find_one({"tenantId": tenant_id})
            if user:
                business_name = user.get("restaurantName") or user.get("businessName") or business_name
    else:
        # Self hosted mode: fetch business name from the first user profile
        user = await db.db.users.find_one({})
        if user:
            business_name = user.get("restaurantName") or user.get("businessName") or business_name
            
    return wa_token, wa_phone_id, business_name

async def _send_whatsapp_payload(wa_phone_id: str, wa_token: str, payload: dict) -> str:
    """Dispatch payload to Meta Graph API and return Meta Message ID."""
    if wa_token == "test_token":
        return f"mock_bot_{int(_now().timestamp())}"
        
    url = f"https://graph.facebook.com/{settings.WA_API_VERSION}/{wa_phone_id}/messages"
    headers = {
        "Authorization": f"Bearer {wa_token}",
        "Content-Type": "application/json"
    }
    
    client = get_http_client()
    resp = await client.post(url, json=payload, headers=headers)
    if resp.status_code not in (200, 201):
        raise Exception(f"Meta Graph API error: {resp.text}")
        
    return resp.json().get("messages", [{}])[0].get("id", "unknown")

async def _send_read_and_typing_status(wa_phone_id: str, wa_token: str, message_id: str):
    """Mark incoming message as read (blue tick) and show typing indicator."""
    if not message_id or wa_token == "test_token":
        return
        
    url = f"https://graph.facebook.com/{settings.WA_API_VERSION}/{wa_phone_id}/messages"
    headers = {
        "Authorization": f"Bearer {wa_token}",
        "Content-Type": "application/json"
    }
    
    client = get_http_client()
    
    # 1. Try combined read + typing indicator
    payload_combined = {
        "messaging_product": "whatsapp",
        "status": "read",
        "message_id": message_id,
        "typing_indicator": {
            "type": "text"
        }
    }
    try:
        resp = await client.post(url, json=payload_combined, headers=headers, timeout=5.0)
        if resp.status_code in (200, 201):
            return
        print(f"[Bot Executor] Combined read+typing failed with status {resp.status_code}. Falling back to standard read status.")
    except Exception as e:
        print(f"[Bot Executor] Combined read+typing exception: {e}. Falling back.")
        
    # 2. Fallback: Standard read status
    payload_read = {
        "messaging_product": "whatsapp",
        "status": "read",
        "message_id": message_id
    }
    try:
        await client.post(url, json=payload_read, headers=headers, timeout=5.0)
    except Exception as e:
        print(f"[Bot Executor] Standard read status fallback exception: {e}")

async def _save_bot_message(
    conv_id: str, 
    wa_msg_id: str, 
    direction: str, 
    msg_type: str, 
    text: str, 
    tenant_id: Optional[str]
):
    """Write bot response to messages collection and notify socket listeners."""
    now = _now()
    doc = {
        "conversationId": conv_id,
        "whatsappMessageId": wa_msg_id,
        "direction": direction,
        "type": msg_type,
        "content": {"text": text},
        "status": "sent",
        "timestamp": now,
        "createdAt": now
    }
    if tenant_id and getattr(settings, "APP_MODE", "self_hosted") == "saas":
        doc["tenantId"] = tenant_id
        
    result = await db.db.messages.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    
    # Update last message on conversation
    conv_update = {
        "lastMessage": text,
        "lastMessageTime": now,
        "updatedAt": now
    }
    
    await db.db.conversations.update_one(
        {"_id": ObjectId(conv_id)},
        {"$set": conv_update}
    )
    
    # Emits
    emit_doc = {**doc, "timestamp": now.isoformat(), "createdAt": now.isoformat()}
    try:
        import asyncio
        asyncio.create_task(sio.emit("message:new", emit_doc, room=conv_id))
        asyncio.create_task(sio.emit("conversation:updated", {"conversationId": conv_id}))
    except Exception:
        pass

async def _execute_node_action(
    action_type: str, 
    payload_config: dict, 
    context: dict, 
    phone_number: str, 
    tenant_id: Optional[str]
) -> dict:
    """Run dynamic database actions (e.g. creating bookings)."""
    result = {"success": True}
    
    if action_type == "create_lead_or_booking":
        # Safe context resolution
        prod_name = context.get("product_name") or "Product Inquiry"
        if "Wholesale Inquiry:" in str(context.get("product_query", "")):
            prod_name = context["product_query"].replace("Wholesale Inquiry:", "").strip()

        prod_code = context.get("product_code") or "N/A"
        qty_val = context.get("quantity") or context.get("quantityRange") or context.get("qty") or "N/A"
        req_val = context.get("comments") or context.get("requirements") or "No specific notes"
        guest_name = f"Wholesale Inquiry: {prod_name}"

        booking_doc = {
            "guestName": guest_name,
            "productName": prod_name,
            "styleCode": prod_code,
            "quantityRange": qty_val,
            "requirements": req_val,
            "phone": phone_number,
            "customerPhone": phone_number,
            "guests": qty_val,
            "date": f"Code: {prod_code}",
            "time": f"Comments: {req_val}",
            "status": "Pending",
            "createdAt": _now(),
            "updatedAt": _now()
        }
        if tenant_id and getattr(settings, "APP_MODE", "self_hosted") == "saas":
            booking_doc["tenantId"] = tenant_id
            
        res_result = await db.db.reservations.insert_one(booking_doc)
        
        # Emit to dashboards
        res_emit = {
            **booking_doc, 
            "_id": str(res_result.inserted_id), 
            "createdAt": booking_doc["createdAt"].isoformat(), 
            "updatedAt": booking_doc["updatedAt"].isoformat()
        }
        await sio.emit("reservation:new", res_emit)

        # Dispatch Outbound Webhook to External Dashboard (Product Inquiry)
        try:
            from app.services.webhook_dispatcher import dispatch_lead_webhook
            await dispatch_lead_webhook(res_emit, event_type="lead.product_inquiry", inquiry_type="product_inquiry", tenant_id=tenant_id)
        except Exception as wh_err:
            print(f"[Lead Webhook Error] {wh_err}")
        
    elif action_type == "fetch_order_status":
        order_lookup = context.get("order_lookup", "").strip()
        
        # Try to find a real order document in DB
        order_query = {
            "$or": [
                {"orderId": order_lookup},
                {"phone": order_lookup},
                {"phone": phone_number}
            ]
        }
        if tenant_id and getattr(settings, "APP_MODE", "self_hosted") == "saas":
            order_query["tenantId"] = tenant_id
            
        order_doc = await db.db.orders.find_one(order_query)
        
        if order_doc:
            context["order_id"] = order_doc.get("orderId") or "45892"
            context["order_status"] = order_doc.get("status") or "Shipped 🚚"
            context["delivery_date"] = order_doc.get("deliveryDate") or "26 July"
            context["tracking_link"] = order_doc.get("trackingLink") or f"https://tracking-link.com/{context['order_id']}"
        else:
            # Generate smart mock values for development testing
            mock_id = order_lookup if (order_lookup and order_lookup.isalnum()) else "45892"
            context["order_id"] = mock_id
            context["order_status"] = "Shipped 🚚"
            context["delivery_date"] = "26 July"
            context["tracking_link"] = f"https://tracking-link.com/{mock_id}"
            
    elif action_type == "create_support_ticket":
        issue_text = context.get("support_issue") or "No issue description provided."
        ticket_doc = {
            "customerPhone": phone_number,
            "issueDescription": issue_text,
            "status": "Open",
            "createdAt": _now(),
            "updatedAt": _now()
        }
        if tenant_id and getattr(settings, "APP_MODE", "self_hosted") == "saas":
            ticket_doc["tenantId"] = tenant_id
            
        ticket_result = await db.db.support_tickets.insert_one(ticket_doc)
        
        # Notify the support team via Socket IO or log
        ticket_emit = {
            **ticket_doc,
            "_id": str(ticket_result.inserted_id),
            "createdAt": ticket_doc["createdAt"].isoformat(),
            "updatedAt": ticket_doc["updatedAt"].isoformat()
        }
        await sio.emit("support_ticket:new", ticket_emit)
        print(f"[CRM] Support Ticket Created: {ticket_emit}")

        # Dispatch Outbound Webhook to External Dashboard (Support Request)
        try:
            from app.services.webhook_dispatcher import dispatch_lead_webhook
            await dispatch_lead_webhook(ticket_emit, event_type="lead.support_request", inquiry_type="support_request", tenant_id=tenant_id)
        except Exception as wh_err:
            print(f"[Support Webhook Error] {wh_err}")

    elif action_type in ("send_menu", "catalog_inquiry", "log_catalog_inquiry"):
        cat_doc = {
            "customerPhone": phone_number,
            "catalogUrl": payload_config.get("catalogUrl") or "http://localhost/menu",
            "notes": "Customer requested digital fabric & design catalog via WhatsApp",
            "status": "New",
            "createdAt": _now(),
            "updatedAt": _now()
        }
        if tenant_id and getattr(settings, "APP_MODE", "self_hosted") == "saas":
            cat_doc["tenantId"] = tenant_id

        # Dispatch Outbound Webhook to External Dashboard (Catalog Inquiry)
        try:
            from app.services.webhook_dispatcher import dispatch_lead_webhook
            await dispatch_lead_webhook(cat_doc, event_type="lead.catalog_inquiry", inquiry_type="catalog_inquiry", tenant_id=tenant_id)
        except Exception as wh_err:
            print(f"[Catalog Webhook Error] {wh_err}")
        
    elif action_type == "save_context":
        # Save static variables from payload to session context
        for k, v in payload_config.items():
            context[k] = v
            
    return result

async def execute_chatbot_flow(
    phone_number: str,
    incoming_msg: dict,
    text_content: str,
    tenant_id: Optional[str],
    conv_id: str
) -> Optional[dict]:
    """
    Unified JSON state-machine flow runner.
    Resolves session history, parses triggers, executes logic nodes, 
    validates input, and sends structured responses.
    """
    # 0. Check global chatbot active status
    bot_settings = await db.db.bot_settings.find_one({})
    if bot_settings and not bot_settings.get("isActive", False):
        print("[Bot Executor] Chatbot is set to Inactive (isActive=False). Skipping auto-reply.")
        return None

    # 1. Fetch chatbot flow schema
    flow = None
    if tenant_id and getattr(settings, "APP_MODE", "self_hosted") == "saas":
        flow = await db.db.bot_flows.find_one({"tenantId": tenant_id})
        
    # If no tenant-specific flow exists, fall back to global active flow or database template
    if not flow:
        flow = await db.db.bot_flows.find_one({"isActive": True}) or await db.db.bot_flows.find_one({})

    # Fallback to local config file if db record is missing
    if not flow:
        config_path = "uploads/configs/active_chatbot_flow.json"
        if os.path.exists(config_path):
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    flow = json.load(f)
            except Exception as e:
                print(f"[Bot Executor] Error loading local flow JSON: {e}")

    if not flow or "nodes" not in flow:
        print("[Bot Executor] No valid flow schema found. Skipping flow runner.")
        return None

    # Fetch WA credentials
    wa_token, wa_phone_id, business_name = await _get_wa_credentials(tenant_id)
    if not wa_token or not wa_phone_id:
        return None

    # Mark incoming message as read & trigger typing indicator in the background
    incoming_msg_id = incoming_msg.get("id")
    if incoming_msg_id:
        import asyncio
        asyncio.create_task(_send_read_and_typing_status(wa_phone_id, wa_token, incoming_msg_id))

    # 2. Check customer session status
    session_query = {"phone": phone_number}
    if tenant_id and getattr(settings, "APP_MODE", "self_hosted") == "saas":
        session_query["tenantId"] = tenant_id
        
    session = await db.db.customer_sessions.find_one(session_query)
    now = _now()
    
    # Expiry validation (sessions expire after 15 minutes of inactivity)
    if session:
        updated_at = session.get("updatedAt")
        if updated_at and (now - updated_at.replace(tzinfo=timezone.utc if updated_at.tzinfo else None)) > timedelta(minutes=SESSION_TIMEOUT_MINUTES):
            await db.db.customer_sessions.delete_one({"_id": session["_id"]})
            session = None

    msg_type = incoming_msg.get("type")
    
    lower_input = text_content.lower().strip()
    
    # Global termination command check - delete session and send thank you
    termination_keywords = ["stop", "no thanks", "bye", "not interested", "cancel", "exit"]
    if any(tk in lower_input for tk in termination_keywords):
        if session:
            await db.db.customer_sessions.delete_one({"_id": session["_id"]})
            session = None
            
        termination_msg = "Thank you! Your conversation has been ended.\n\nType 'hi' or 'menu' anytime to start again. Have a nice day!"
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone_number,
            "type": "text",
            "text": {"preview_url": False, "body": termination_msg}
        }
        wa_msg_id = await _send_whatsapp_payload(wa_phone_id, wa_token, payload)
        await _save_bot_message(conv_id, wa_msg_id, "outbound", "text", termination_msg, tenant_id)
        return {"type": "terminated", "text": termination_msg}

    # Global 'menu' command intercept - reset conversation
    if lower_input == "menu":
        if session:
            await db.db.customer_sessions.delete_one({"_id": session["_id"]})
            session = None

    # Check for pre-filled product card CTA message
    import re
    cta_pattern = r"interested in:\s*(.*?)\s*\(Code:\s*(.*?)\s*\|\s*Cat:\s*(.*?)\s*\|\s*Subcat:\s*(.*?)\)"
    match = re.search(cta_pattern, text_content, re.IGNORECASE)
    
    if match:
        product_name = match.group(1).strip()
        product_code = match.group(2).strip()
        product_cat = match.group(3).strip()
        product_subcat = match.group(4).strip()
        
        # Override start node and initialize new session context
        current_node_id = "node_enquiry_qty_menu"
        session_doc = {
            "phone": phone_number,
            "activeFlowId": flow.get("flowId", "default"),
            "activeNodeId": current_node_id,
            "contextData": {
                "product_name": product_name,
                "product_code": product_code,
                "product_cat": product_cat,
                "product_subcat": product_subcat
            },
            "createdAt": now,
            "updatedAt": now
        }
        if tenant_id and getattr(settings, "APP_MODE", "self_hosted") == "saas":
            session_doc["tenantId"] = tenant_id
            
        await db.db.customer_sessions.update_one(
            {"phone": phone_number},
            {"$set": session_doc},
            upsert=True
        )
        session = session_doc

    # Determine the node index pointer to process
    current_node_id = None
    context = {}
    
    if session:
        current_node_id = session.get("activeNodeId")
        context = session.get("contextData", {})
    else:
        # Check standard FAQ keywords before launching flows
        lower_input = text_content.lower().strip()
        faq_query = {"isActive": True}
        if tenant_id and getattr(settings, "APP_MODE", "self_hosted") == "saas":
            faq_query["tenantId"] = tenant_id
            
        faq_cursor = db.db.faq_items.find(faq_query)
        matched_faq = None
        async for faq in faq_cursor:
            if any(keyword in lower_input for keyword in faq.get("keywords", [])):
                matched_faq = faq
                break
                
        if matched_faq:
            bot_reply = matched_faq.get("answer", "")
            payload = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": phone_number,
                "type": "text",
                "text": {"preview_url": False, "body": bot_reply}
            }
            wa_msg_id = await _send_whatsapp_payload(wa_phone_id, wa_token, payload)
            await _save_bot_message(conv_id, wa_msg_id, "outbound", "text", bot_reply, tenant_id)
            return {"type": "faq", "text": bot_reply}

        # Check triggers or default to startNode
        is_trigger_match = False
        welcome_keywords = ["hi", "hello", "hey", "start", "help", "menu", "book", "reservation"]
        if any(kw in lower_input for kw in welcome_keywords):
            is_trigger_match = True

        # Automatic Product Inquiry Extraction & Fast-Forward to Quantity Selection
        enquiry_keywords = ["enquir", "inquir", "interested", "price", "wholesale", "style code", "saree", "kurti", "lehenga"]
        if any(kw in lower_input for kw in enquiry_keywords):
            prod_name = "Selected Product"
            prod_code = "N/A"

            # 1. Parse style code (e.g. Style Code: RC-SAREE-902 or Code: RC-902)
            code_match = re.search(r"(?:code|style|id)[:\s]*([A-Z0-9\-_]+)", text_content, re.IGNORECASE)
            if code_match:
                prod_code = code_match.group(1).strip()

            # 2. Parse product name (e.g. purchasing the Silk Designer Saree)
            name_match = re.search(r"(?:purchasing|buying|about)\s+(?:the\s+)?([^\(\.\,\n]+)", text_content, re.IGNORECASE)
            if not name_match:
                name_match = re.search(r"interested\s+in\s+([^\(\.\,\n]+)", text_content, re.IGNORECASE)

            if name_match:
                extracted_name = name_match.group(1).strip()
                # Clean up any leftover trailing keywords
                for kw in ["please", "price", "wholesale", "minimum", "quantity"]:
                    if kw in extracted_name.lower():
                        extracted_name = extracted_name.lower().split(kw)[0].strip()
                if extracted_name:
                    prod_name = extracted_name.title()

            context["product_query"] = f"{prod_name} (Code: {prod_code})"
            context["product_name"] = prod_name
            context["product_code"] = prod_code

            # Fast-forward directly to Quantity node
            if "node_enquiry_qty_en" in flow.get("nodes", {}):
                current_node_id = "node_enquiry_qty_en"
            elif "node_enquiry_start_en" in flow.get("nodes", {}):
                current_node_id = "node_enquiry_start_en"
            else:
                current_node_id = flow.get("startNode")
        else:
            current_node_id = flow.get("startNode")

        if is_trigger_match or True: # Responsive fallback
            # Create session
            session_doc = {
                "phone": phone_number,
                "activeFlowId": flow.get("flowId", "default"),
                "activeNodeId": current_node_id,
                "contextData": context,
                "createdAt": now,
                "updatedAt": now
            }
            if tenant_id and getattr(settings, "APP_MODE", "self_hosted") == "saas":
                session_doc["tenantId"] = tenant_id
                
            await db.db.customer_sessions.update_one(
                {"phone": phone_number},
                {"$set": session_doc},
                upsert=True
            )
            session = session_doc

    if not current_node_id or current_node_id not in flow["nodes"]:
        return None

    # 3. Process Customer Input (if session was already active)
    if session and session.get("createdAt") != now:
        node = flow["nodes"][current_node_id]
        input_accepted = False
        
        if node["type"] == "collect_input":
            if msg_type == "text":
                validation_rule = node.get("validation", {})
                if _validate_input(text_content, validation_rule):
                    # Save value to context
                    save_key = node["saveContextKey"]
                    context[save_key] = text_content.strip()
                    current_node_id = node.get("nextNode")
                    input_accepted = True
                else:
                    # Input validation failed — reply with error prompt
                    error_prompt = validation_rule.get("errorMessage", "Invalid format. Please reply again.")
                    payload = {
                        "messaging_product": "whatsapp",
                        "recipient_type": "individual",
                        "to": phone_number,
                        "type": "text",
                        "text": {"preview_url": False, "body": error_prompt}
                    }
                    wa_msg_id = await _send_whatsapp_payload(wa_phone_id, wa_token, payload)
                    await _save_bot_message(conv_id, wa_msg_id, "outbound", "text", error_prompt, tenant_id)
                    # Update session timestamp
                    await db.db.customer_sessions.update_one(
                        {"phone": phone_number},
                        {"$set": {"updatedAt": _now()}}
                    )
                    return {"type": "validation_error", "text": error_prompt}
            else:
                # Expecting text, received media/other. Skip.
                return None
                
        elif node["type"] == "interactive_button":
            if msg_type == "interactive":
                interactive_data = incoming_msg.get("interactive", {})
                if interactive_data.get("type") == "button_reply":
                    tapped_btn_id = interactive_data.get("button_reply", {}).get("id")
                    
                    # Match button mappings
                    matched_btn = None
                    for btn in node.get("buttons", []):
                        if btn.get("id") == tapped_btn_id:
                            matched_btn = btn
                            break
                            
                    if matched_btn:
                        current_node_id = matched_btn.get("nextNode")
                        input_accepted = True
            
            # If not interactive reply, resend buttons prompt
            if not input_accepted:
                error_msg = "I didn't understand. Please select from the given options."
                payload = {
                    "messaging_product": "whatsapp",
                    "recipient_type": "individual",
                    "to": phone_number,
                    "type": "text",
                    "text": {"preview_url": False, "body": error_msg}
                }
                wa_msg_id = await _send_whatsapp_payload(wa_phone_id, wa_token, payload)
                await _save_bot_message(conv_id, wa_msg_id, "outbound", "text", error_msg, tenant_id)
                # Keep activeNodeId and update timestamp
                await db.db.customer_sessions.update_one(
                    {"phone": phone_number},
                    {"$set": {"updatedAt": _now()}}
                )

        elif node["type"] == "interactive_list":
            if msg_type == "interactive":
                interactive_data = incoming_msg.get("interactive", {})
                if interactive_data.get("type") == "list_reply":
                    tapped_row_id = interactive_data.get("list_reply", {}).get("id")
                    
                    # Match row mappings
                    matched_row = None
                    for section in node.get("sections", []):
                        for row in section.get("rows", []):
                            if row.get("id") == tapped_row_id:
                                matched_row = row
                                break
                        if matched_row:
                            break
                            
                    if matched_row:
                        current_node_id = matched_row.get("nextNode")
                        input_accepted = True
                        row_title = matched_row.get("title", "")
                        context["quantity"] = row_title
                        context["quantityRange"] = row_title
            
            # If not list reply, resend list prompt
            if not input_accepted:
                error_msg = "I didn't understand. Please select from the list."
                payload = {
                    "messaging_product": "whatsapp",
                    "recipient_type": "individual",
                    "to": phone_number,
                    "type": "text",
                    "text": {"preview_url": False, "body": error_msg}
                }
                wa_msg_id = await _send_whatsapp_payload(wa_phone_id, wa_token, payload)
                await _save_bot_message(conv_id, wa_msg_id, "outbound", "text", error_msg, tenant_id)
                # Keep activeNodeId and update timestamp
                await db.db.customer_sessions.update_one(
                    {"phone": phone_number},
                    {"$set": {"updatedAt": _now()}}
                )

        if not input_accepted:
            return {"type": "validation_error", "text": "I didn't understand. Please select from the given options."}

    # 4. State-Machine Output Progression Loop
    max_loops = 10
    loops = 0
    
    while current_node_id and current_node_id in flow["nodes"] and loops < max_loops:
        loops += 1
        node = flow["nodes"][current_node_id]
        
        if node["type"] == "text":
            body_text = _format_text(node["text"], context, business_name)
            payload = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": phone_number,
                "type": "text",
                "text": {"preview_url": False, "body": body_text}
            }
            wa_msg_id = await _send_whatsapp_payload(wa_phone_id, wa_token, payload)
            await _save_bot_message(conv_id, wa_msg_id, "outbound", "text", body_text, tenant_id)
            
            # Progress pointer
            current_node_id = node.get("nextNode")
            if not current_node_id or node.get("endSession"):
                # End of flow — clean up session
                await db.db.customer_sessions.delete_one({"phone": phone_number})
                break
                
        elif node["type"] == "interactive_button":
            body_text = _format_text(node["text"], context, business_name)
            buttons_payload = []
            for btn in node.get("buttons", []):
                buttons_payload.append({
                    "type": "reply",
                    "reply": {
                        "id": btn.get("id"),
                        "title": btn.get("title")
                    }
                })
                
            payload = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": phone_number,
                "type": "interactive",
                "interactive": {
                    "type": "button",
                    "body": {"text": body_text},
                    "action": {
                        "buttons": buttons_payload
                    }
                }
            }
            wa_msg_id = await _send_whatsapp_payload(wa_phone_id, wa_token, payload)
            await _save_bot_message(conv_id, wa_msg_id, "outbound", "interactive", body_text, tenant_id)
            
            # Update session pointer & pause (waiting for customer tap)
            await db.db.customer_sessions.update_one(
                {"phone": phone_number},
                {"$set": {
                    "activeNodeId": current_node_id,
                    "contextData": context,
                    "updatedAt": _now()
                }}
            )
            break
            
        elif node["type"] == "interactive_list":
            body_text = _format_text(node["text"], context, business_name)
            sections_payload = []
            
            for sec in node.get("sections", []):
                rows_payload = []
                for row in sec.get("rows", []):
                    row_doc = {
                        "id": row.get("id"),
                        "title": row.get("title")[:24]
                    }
                    if row.get("description"):
                        row_doc["description"] = row.get("description")[:72]
                    rows_payload.append(row_doc)
                
                sec_doc = {
                    "rows": rows_payload
                }
                if sec.get("title"):
                    sec_doc["title"] = sec.get("title")[:24]
                sections_payload.append(sec_doc)
                
            payload = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": phone_number,
                "type": "interactive",
                "interactive": {
                    "type": "list",
                    "body": {"text": body_text},
                    "action": {
                        "button": node.get("buttonText", "Select Options")[:20],
                        "sections": sections_payload
                    }
                }
            }
            if node.get("headerText"):
                payload["interactive"]["header"] = {"type": "text", "text": node["headerText"][:60]}
            if node.get("footerText"):
                payload["interactive"]["footer"] = {"text": node["footerText"][:60]}
                
            wa_msg_id = await _send_whatsapp_payload(wa_phone_id, wa_token, payload)
            await _save_bot_message(conv_id, wa_msg_id, "outbound", "interactive", body_text, tenant_id)
            
            await db.db.customer_sessions.update_one(
                {"phone": phone_number},
                {"$set": {
                    "activeNodeId": current_node_id,
                    "contextData": context,
                    "updatedAt": _now()
                }}
            )
            break
            
        elif node["type"] == "collect_input":
            body_text = _format_text(node["text"], context, business_name)
            payload = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": phone_number,
                "type": "text",
                "text": {"preview_url": False, "body": body_text}
            }
            wa_msg_id = await _send_whatsapp_payload(wa_phone_id, wa_token, payload)
            await _save_bot_message(conv_id, wa_msg_id, "outbound", "text", body_text, tenant_id)
            
            # Update session pointer & pause (waiting for customer reply)
            await db.db.customer_sessions.update_one(
                {"phone": phone_number},
                {"$set": {
                    "activeNodeId": current_node_id,
                    "contextData": context,
                    "updatedAt": _now()
                }}
            )
            break
            
        elif node["type"] == "action_node":
            action_type = node.get("action")
            action_payload = node.get("payload", {})
            
            try:
                await _execute_node_action(action_type, action_payload, context, phone_number, tenant_id)
            except Exception as e:
                print(f"[Bot Executor] Action node execution failure: {e}")
                
            # Progress pointer
            current_node_id = node.get("nextNode")
            if not current_node_id:
                # End of flow
                await db.db.customer_sessions.delete_one({"phone": phone_number})
                break

    return {"status": "success", "currentNodeId": current_node_id}
