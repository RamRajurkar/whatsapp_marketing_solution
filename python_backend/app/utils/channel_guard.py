"""
Channel Entitlement Guard Middleware & Dependencies.
Enforces 403 Forbidden on API routes if the calling tenant's subscription does not enable that channel.
"""

from fastapi import Depends, HTTPException
from app.config import settings
from app.database import db
from app.routes.auth import get_current_user
from bson import ObjectId

def require_channel(channel_name: str):
    """
    FastAPI dependency factory enforcing channel entitlement.
    Raises 403 Forbidden if channel is not in tenant's enabledChannels.
    """
    async def _channel_guard(current_user: dict = Depends(get_current_user)):
        # Self-hosted mode allows all channels by default
        if getattr(settings, "APP_MODE", "self_hosted") != "saas":
            return True

        tenant_id = current_user.get("tenantId")
        if not tenant_id:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: User has no associated tenant for channel '{channel_name}'."
            )

        # Lookup tenant record
        tenant = None
        try:
            tenant = await db.db.tenants.find_one({"_id": ObjectId(tenant_id)})
        except Exception:
            pass

        if not tenant:
            tenant = await db.db.tenants.find_one({"_id": str(tenant_id)})

        if not tenant:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: Tenant record not found for channel '{channel_name}'."
            )

        enabled_channels = tenant.get("enabledChannels", ["whatsapp"])
        if channel_name not in enabled_channels:
            raise HTTPException(
                status_code=403,
                detail=f"Channel '{channel_name}' is not enabled on this tenant's subscription."
            )

        return True

    return _channel_guard
