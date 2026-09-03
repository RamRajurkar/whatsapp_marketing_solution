from typing import Optional, Dict, Any
from app.config import settings
from app.database import db
from app.utils.crypto_vault import crypto_vault

def get_tenant_filter(current_user: dict) -> dict:
    """
    Get MongoDB query filter for scoping records to the current tenant.
    Returns empty dict in self_hosted mode.
    """
    if getattr(settings, "APP_MODE", "self_hosted") == "saas":
        tenant_id = current_user.get("tenantId") or str(current_user.get("_id"))
        return {"tenantId": str(tenant_id)}
    return {}

def inject_tenant_id(doc: dict, current_user: dict) -> dict:
    """
    Inject tenant identifier into a document before writing to the database.
    Does nothing in self_hosted mode.
    """
    if getattr(settings, "APP_MODE", "self_hosted") == "saas":
        tenant_id = current_user.get("tenantId") or str(current_user.get("_id"))
        doc["tenantId"] = str(tenant_id)
    return doc

async def resolve_webhook_tenant(wa_phone_id: str) -> Optional[str]:
    """
    Find tenantId associated with the WhatsApp Phone ID.
    In self_hosted mode, returns None (no tenant scoping needed).
    In SaaS mode:
      1. Checks wa_connections collection.
      2. Checks users collection (backwards compatibility).
    """
    if not wa_phone_id or getattr(settings, "APP_MODE", "self_hosted") != "saas":
        return None

    # Check dedicated wa_connections collection
    conn = await db.db.wa_connections.find_one({"phoneNumberId": str(wa_phone_id)})
    if conn and conn.get("tenantId"):
        return str(conn["tenantId"])

    # Fallback to users
    user = await db.db.users.find_one({
        "$or": [
            {"waPhoneNumberId": str(wa_phone_id)},
            {"settings.waPhoneNumberId": str(wa_phone_id)}
        ]
    })
    if user:
        return str(user.get("tenantId") or user.get("_id"))
    return None

async def resolve_webhook_connection(wa_phone_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch decrypted connection credentials for an incoming webhook event.
    """
    if not wa_phone_id:
        return None

    conn = await db.db.wa_connections.find_one({"phoneNumberId": str(wa_phone_id)})
    if conn:
        return {
            "tenantId": str(conn["tenantId"]),
            "phoneNumberId": conn["phoneNumberId"],
            "wabaId": conn.get("wabaId"),
            "accessToken": crypto_vault.decrypt_secret(conn.get("accessTokenEncrypted", "")),
            "appSecret": crypto_vault.decrypt_secret(conn.get("appSecretEncrypted")) if conn.get("appSecretEncrypted") else None,
            "verifyToken": crypto_vault.decrypt_secret(conn.get("verifyTokenEncrypted")) if conn.get("verifyTokenEncrypted") else None,
        }

    # Fallback to single-tenant settings
    return {
        "tenantId": None,
        "phoneNumberId": settings.WA_PHONE_NUMBER_ID,
        "wabaId": settings.WA_BUSINESS_ACCOUNT_ID,
        "accessToken": settings.WA_ACCESS_TOKEN,
        "appSecret": settings.WA_APP_SECRET,
        "verifyToken": settings.WA_VERIFY_TOKEN,
    }
