from typing import Optional
from app.config import settings
from app.database import db

def get_tenant_filter(current_user: dict) -> dict:
    """
    Get MongoDB query filter for scoping records to the current tenant.
    Returns empty dict in self_hosted mode.
    """
    if getattr(settings, "APP_MODE", "self_hosted") == "saas":
        tenant_id = str(current_user.get("_id"))
        return {"tenantId": tenant_id}
    return {}

def inject_tenant_id(doc: dict, current_user: dict) -> dict:
    """
    Inject tenant identifier into a document before writing to the database.
    Does nothing in self_hosted mode.
    """
    if getattr(settings, "APP_MODE", "self_hosted") == "saas":
        tenant_id = str(current_user.get("_id"))
        doc["tenantId"] = tenant_id
    return doc

async def resolve_webhook_tenant(wa_phone_id: str) -> Optional[str]:
    """
    Find user_id (tenantId) associated with the WhatsApp Phone ID.
    In self_hosted mode, returns None (no tenant scoping needed).
    In SaaS mode, queries users collection to find the owner tenant.
    """
    if getattr(settings, "APP_MODE", "self_hosted") != "saas":
        return None
        
    user = await db.db.users.find_one({
        "$or": [
            {"waPhoneNumberId": wa_phone_id},
            {"settings.waPhoneNumberId": wa_phone_id}
        ]
    })
    
    if user:
        return str(user["_id"])
    return None
