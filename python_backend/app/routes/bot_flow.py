import os
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional

from app.routes.auth import get_current_user
from app.database import db
from app.config import settings
from app.repositories.base import TenantScopedRepository
from app.utils.channel_guard import require_channel

router = APIRouter(dependencies=[Depends(require_channel("whatsapp"))])

CONFIG_DIR = "uploads/configs"
CONFIG_FILE = os.path.join(CONFIG_DIR, "active_chatbot_flow.json")

os.makedirs(CONFIG_DIR, exist_ok=True)

class FlowPayload(BaseModel):
    flowId: str = "default_flow"
    startNode: str = "node_welcome"
    nodes: Dict[str, Any]

DEFAULT_FLOW = {
    "flowId": "default_flow",
    "startNode": "node_welcome",
    "nodes": {
        "node_welcome": {
            "type": "interactive_button",
            "text": "Hello! Welcome to {business_name}. How can we support you today?",
            "buttons": [
                { "id": "btn_catalog", "title": "📜 View Menu", "nextNode": "node_menu_catalog" },
                { "id": "btn_booking", "title": "📅 Book a Table", "nextNode": "node_book_start" }
            ]
        },
        "node_menu_catalog": {
            "type": "text",
            "text": "Here is our digital menu catalog: {catalog_url}\nEnjoy your selection!",
            "nextNode": "node_welcome"
        },
        "node_book_start": {
            "type": "collect_input",
            "text": "Sure, let's schedule a table. How many guests? 👥 (Reply with a number)",
            "saveContextKey": "guests",
            "validation": {
                "type": "number",
                "errorMessage": "❌ Invalid input. Please reply with a valid number (e.g. 4)"
            },
            "nextNode": "node_book_date"
        },
        "node_book_date": {
            "type": "collect_input",
            "text": "What date? 📅 (e.g. 25 June)",
            "saveContextKey": "date",
            "nextNode": "node_book_time"
        },
        "node_book_time": {
            "type": "collect_input",
            "text": "What time would you prefer? 🕒 (e.g. 7:30 PM)",
            "saveContextKey": "time",
            "nextNode": "node_book_finalize"
        },
        "node_book_finalize": {
            "type": "action_node",
            "action": "create_lead_or_booking",
            "payload": {
                "guests": "{guests}",
                "date": "{date}",
                "time": "{time}"
            },
            "nextNode": "node_book_done"
        },
        "node_book_done": {
            "type": "text",
            "text": "✅ Thank you! Your booking for {guests} guests on {date} at {time} has been requested.\nOur manager will confirm soon.",
            "nextNode": "node_welcome"
        }
    }
}

def _get_flow_repo(current_user: dict):
    return TenantScopedRepository(db.db.bot_flows, current_user.get("tenantId"))

@router.get("")
@router.get("/")
async def get_chatbot_flow(current_user: dict = Depends(get_current_user)):
    """Fetch the active chatbot state-machine flow JSON for the calling tenant."""
    flow_repo = _get_flow_repo(current_user)
    flow = await flow_repo.find_one({})
    
    if not flow:
        # Self-hosted mode: try reading local file if MongoDB is empty
        if getattr(settings, "APP_MODE", "self_hosted") != "saas" and os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    flow_content = json.load(f)
                    
                flow_content["updatedAt"] = datetime.now(timezone.utc)
                await flow_repo.update_one(
                    {"flowId": flow_content.get("flowId", "default")},
                    {"$set": flow_content},
                    upsert=True
                )
                flow = await flow_repo.find_one({})
            except Exception as e:
                print(f"[Flow Router] Error syncing local file: {e}")
                
    if not flow:
        # Default initialization if nothing is found
        init_flow = DEFAULT_FLOW.copy()
        init_flow["createdAt"] = datetime.now(timezone.utc)
        init_flow["updatedAt"] = datetime.now(timezone.utc)
        
        await flow_repo.insert_one(init_flow)
        flow = init_flow
        
        # Self-hosted mode: write default JSON to disk
        if getattr(settings, "APP_MODE", "self_hosted") != "saas":
            try:
                with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                    json.dump(DEFAULT_FLOW, f, indent=2)
            except Exception as e:
                print(f"[Flow Router] Error writing initial local file: {e}")

    if "_id" in flow:
        flow["_id"] = str(flow["_id"])
        
    return flow

@router.post("")
@router.post("/")
@router.put("")
@router.put("/")
async def update_chatbot_flow(
    data: FlowPayload,
    current_user: dict = Depends(get_current_user)
):
    """Save the updated chatbot flow for the calling tenant."""
    flow_repo = _get_flow_repo(current_user)
    flow_doc = data.model_dump()
    flow_doc["updatedAt"] = datetime.now(timezone.utc)
    
    # Overwrite flow config
    await flow_repo.update_one(
        {"flowId": data.flowId},
        {"$set": flow_doc},
        upsert=True
    )
    
    # Self-hosted file syncing
    if getattr(settings, "APP_MODE", "self_hosted") != "saas":
        try:
            clean_doc = data.model_dump()
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(clean_doc, f, indent=2)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to sync chatbot flow to file: {e}")
            
    return {"message": "Chatbot flow configuration saved successfully"}
