"""
Agency Management & Billing Ledger API Router.
Handles sub-account client provisioning and wholesale / revenue share billing ledgers.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from datetime import datetime, timezone
from bson import ObjectId

from app.routes.auth import get_current_user
from app.database import db
from app.models.tenant import AgencyBillingLedger, Tenant

router = APIRouter()

def _now():
    return datetime.now(timezone.utc)

def require_agency_user(current_user: dict = Depends(get_current_user)):
    role = current_user.get("role")
    agency_id = current_user.get("agencyId")
    if role not in ("agency_owner", "agency_admin", "superadmin") or not agency_id:
        raise HTTPException(status_code=403, detail="Forbidden: Agency manager role required")
    return current_user

class CreateAgencyClientRequest(BaseModel):
    name: str
    adminEmail: str
    adminName: str
    enabledChannels: List[str] = ["whatsapp"]
    plan: str = "starter"

class RecordLedgerEntryRequest(BaseModel):
    clientTenantId: str
    entryType: str  # "wholesale_charge", "revenue_share_commission", "payout", "adjustment"
    amount: float
    description: str

@router.get("/clients", dependencies=[Depends(require_agency_user)])
async def list_agency_clients(current_user: dict = Depends(require_agency_user)):
    """List all managed client tenants under this agency."""
    agency_id = current_user.get("agencyId")
    tenants = await db.db.tenants.find({"agencyId": agency_id}).to_list(length=100)
    for t in tenants:
        t["_id"] = str(t["_id"])
    return {"clients": tenants, "total": len(tenants)}

@router.post("/clients", dependencies=[Depends(require_agency_user)])
async def create_agency_client(
    req: CreateAgencyClientRequest,
    current_user: dict = Depends(require_agency_user)
):
    """Provision a new sub-client tenant under this agency."""
    agency_id = current_user.get("agencyId")

    # Check if admin email already exists
    existing_user = await db.db.users.find_one({"email": req.adminEmail})
    if existing_user:
        raise HTTPException(status_code=400, detail="User with this email already exists")

    tenant_doc = {
        "name": req.name,
        "agencyId": agency_id,
        "enabledChannels": req.enabledChannels,
        "plan": req.plan,
        "status": "active",
        "createdAt": _now(),
        "updatedAt": _now()
    }
    res = await db.db.tenants.insert_one(tenant_doc)
    tenant_id = str(res.inserted_id)

    # Create client owner user
    from app.utils.auth import get_password_hash
    client_user_doc = {
        "email": req.adminEmail,
        "name": req.adminName,
        "hashed_password": get_password_hash("TempPass123!"),
        "role": "tenant_owner",
        "tenantId": tenant_id,
        "agencyId": agency_id,
        "status": "active",
        "createdAt": _now(),
        "updatedAt": _now()
    }
    await db.db.users.insert_one(client_user_doc)

    return {
        "message": f"Client tenant '{req.name}' provisioned successfully under agency",
        "tenantId": tenant_id,
        "adminEmail": req.adminEmail
    }

@router.get("/ledger", dependencies=[Depends(require_agency_user)])
async def get_agency_billing_ledger(current_user: dict = Depends(require_agency_user)):
    """Retrieve billing ledger transactions between Black Angler and the agency."""
    agency_id = current_user.get("agencyId")
    entries = await db.db.agency_billing_ledgers.find({"agencyId": agency_id}).sort("createdAt", -1).to_list(length=200)

    total_debits = sum(e["amount"] for e in entries if e.get("entryType") in ("wholesale_charge", "payout"))
    total_credits = sum(e["amount"] for e in entries if e.get("entryType") == "revenue_share_commission")
    net_balance = total_credits - total_debits

    for e in entries:
        e["_id"] = str(e["_id"])

    return {
        "entries": entries,
        "totalCredits": total_credits,
        "totalDebits": total_debits,
        "netBalance": net_balance
    }

@router.post("/ledger/entry", dependencies=[Depends(require_agency_user)])
async def record_ledger_entry(
    req: RecordLedgerEntryRequest,
    current_user: dict = Depends(require_agency_user)
):
    """Record a wholesale debit or revenue share commission in the agency ledger."""
    agency_id = current_user.get("agencyId")

    entry_doc = {
        "agencyId": agency_id,
        "clientTenantId": req.clientTenantId,
        "entryType": req.entryType,
        "amount": req.amount,
        "description": req.description,
        "status": "settled",
        "createdAt": _now()
    }
    res = await db.db.agency_billing_ledgers.insert_one(entry_doc)
    entry_doc["_id"] = str(res.inserted_id)

    return {"message": "Ledger transaction recorded", "entry": entry_doc}
