"""
Superadmin Platform Management API.
Supports global tenant provisioning, channel entitlement management, subscription overrides,
and audit-logged impersonation sessions.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from datetime import datetime, timezone
from bson import ObjectId

from app.routes.auth import get_current_user
from app.database import db
from app.utils.auth import create_access_token

router = APIRouter()

def _now():
    return datetime.now(timezone.utc)

def require_superadmin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Forbidden: Superadmin privileges required")
    return current_user

class UpdateTenantChannelsRequest(BaseModel):
    enabledChannels: List[str]  # ["whatsapp", "gbp", "voice", "sms"]

class UpdateTenantPlanRequest(BaseModel):
    plan: str  # "starter", "professional", "enterprise"
    status: str = "active"

@router.get("/tenants", dependencies=[Depends(require_superadmin)])
async def list_all_tenants(
    search: Optional[str] = None,
    limit: int = Query(100, le=200)
):
    """List all registered platform tenants with active channels and subscription tiers."""
    query = {}
    if search:
        query = {"name": {"$regex": search, "$options": "i"}}

    tenants = await db.db.tenants.find(query).sort("createdAt", -1).to_list(length=limit)
    for t in tenants:
        t["_id"] = str(t["_id"])
        # Fetch user count
        t["userCount"] = await db.db.users.count_documents({"tenantId": t["_id"]})
    return {"tenants": tenants, "total": len(tenants)}

@router.patch("/tenants/{tenant_id}/channels", dependencies=[Depends(require_superadmin)])
async def update_tenant_channels(
    tenant_id: str,
    req: UpdateTenantChannelsRequest,
    admin: dict = Depends(require_superadmin)
):
    """Enable or disable specific channel modules for a tenant."""
    try:
        obj_id = ObjectId(tenant_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid tenant ID")

    result = await db.db.tenants.update_one(
        {"_id": obj_id},
        {"$set": {"enabledChannels": req.enabledChannels, "updatedAt": _now()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Write audit log
    await db.db.audit_logs.insert_one({
        "action": "update_tenant_channels",
        "superadminId": str(admin["_id"]),
        "tenantId": tenant_id,
        "newChannels": req.enabledChannels,
        "timestamp": _now()
    })

    return {"message": "Tenant enabled channels updated successfully", "enabledChannels": req.enabledChannels}

@router.post("/impersonate/{tenant_id}", dependencies=[Depends(require_superadmin)])
async def impersonate_tenant(
    tenant_id: str,
    admin: dict = Depends(require_superadmin)
):
    """
    Generate a time-limited impersonation JWT to access a tenant workspace for customer support.
    Explicitly logs the impersonation event to the platform audit ledger.
    """
    try:
        obj_id = ObjectId(tenant_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid tenant ID")

    tenant = await db.db.tenants.find_one({"_id": obj_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Generate token with impersonated tenant context
    impersonation_payload = {
        "id": str(admin["_id"]),
        "sub": admin.get("email", "superadmin"),
        "tenantId": tenant_id,
        "role": "tenant_admin",
        "isImpersonating": True,
        "impersonatedBy": str(admin["_id"])
    }
    impersonation_token = create_access_token(data=impersonation_payload)

    # Log to audit trail
    await db.db.audit_logs.insert_one({
        "action": "impersonate_tenant",
        "superadminId": str(admin["_id"]),
        "superadminEmail": admin.get("email"),
        "targetTenantId": tenant_id,
        "targetTenantName": tenant.get("name"),
        "timestamp": _now()
    })

    return {
        "message": f"Impersonation token generated for tenant '{tenant.get('name')}'",
        "token": impersonation_token,
        "tenant": {
            "id": str(tenant["_id"]),
            "name": tenant.get("name"),
            "enabledChannels": tenant.get("enabledChannels", [])
        }
    }
