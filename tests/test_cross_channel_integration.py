"""
Cross-Channel Integration & Unified Panels Test Suite.
Tests:
1. Superadmin tenant provisioning, channel entitlement updates, and audit-logged impersonation.
2. Agency sub-client provisioning and billing ledger calculations.
3. Self-hosted mode regression test (APP_MODE="self_hosted").
"""

import pytest
import os
from datetime import datetime, timezone
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import HTTPException

from app.config import settings
from app.models.tenant import Tenant, Agency, AgencyBillingLedger
from app.repositories.base import TenantScopedRepository
from app.routes.superadmin import update_tenant_channels, impersonate_tenant
from app.routes.agency import list_agency_clients, get_agency_billing_ledger

TEST_DB_NAME = "test_cross_channel_db"
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")

@pytest.fixture(scope="function")
def mongo_client():
    client = AsyncIOMotorClient(MONGODB_URI)
    yield client
    client.close()

# ─────────────────────────────────────────────────────────────────────────────
# 1. Superadmin Channel Management & Impersonation Tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_superadmin_channel_update_and_audit_log(mongo_client):
    from app.database import db
    db.db = mongo_client[TEST_DB_NAME]
    await db.db.tenants.delete_many({})
    await db.db.audit_logs.delete_many({})

    tenant_id = ObjectId()
    await db.db.tenants.insert_one({
        "_id": tenant_id,
        "name": "Acme Retailers",
        "enabledChannels": ["whatsapp"],
        "status": "active"
    })

    superadmin_user = {
        "_id": str(ObjectId()),
        "email": "superadmin@blackangler.com",
        "role": "superadmin"
    }

    # 1. Update enabled channels to add GBP
    from app.routes.superadmin import UpdateTenantChannelsRequest
    res = await update_tenant_channels(
        tenant_id=str(tenant_id),
        req=UpdateTenantChannelsRequest(enabledChannels=["whatsapp", "gbp"]),
        admin=superadmin_user
    )
    assert res["enabledChannels"] == ["whatsapp", "gbp"]

    # Verify audit log was recorded
    log = await db.db.audit_logs.find_one({"action": "update_tenant_channels"})
    assert log is not None
    assert log["tenantId"] == str(tenant_id)
    assert log["newChannels"] == ["whatsapp", "gbp"]

    # 2. Test audit-logged impersonation
    impersonate_res = await impersonate_tenant(
        tenant_id=str(tenant_id),
        admin=superadmin_user
    )
    assert "token" in impersonate_res
    assert impersonate_res["tenant"]["name"] == "Acme Retailers"

    impersonate_log = await db.db.audit_logs.find_one({"action": "impersonate_tenant"})
    assert impersonate_log is not None
    assert impersonate_log["targetTenantId"] == str(tenant_id)

# ─────────────────────────────────────────────────────────────────────────────
# 2. Agency Sub-Client Provisioning & Billing Ledger Tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_agency_client_and_billing_ledger(mongo_client):
    from app.database import db
    db.db = mongo_client[TEST_DB_NAME]
    await db.db.tenants.delete_many({})
    await db.db.agency_billing_ledgers.delete_many({})

    agency_id = str(ObjectId())
    agency_user = {
        "_id": str(ObjectId()),
        "email": "partner@mediaagency.com",
        "role": "agency_owner",
        "agencyId": agency_id
    }

    # 1. Provision 2 sub-client tenants
    await db.db.tenants.insert_one({
        "name": "Agency Client 1",
        "agencyId": agency_id,
        "enabledChannels": ["whatsapp", "gbp"],
        "status": "active"
    })
    await db.db.tenants.insert_one({
        "name": "Agency Client 2",
        "agencyId": agency_id,
        "enabledChannels": ["whatsapp"],
        "status": "active"
    })

    client_res = await list_agency_clients(current_user=agency_user)
    assert client_res["total"] == 2

    # 2. Record wholesale charges and revenue share credits
    await db.db.agency_billing_ledgers.insert_one({
        "agencyId": agency_id,
        "entryType": "wholesale_charge",
        "amount": 200.0,
        "description": "Monthly Platform Wholesale Base Fee"
    })
    await db.db.agency_billing_ledgers.insert_one({
        "agencyId": agency_id,
        "entryType": "revenue_share_commission",
        "amount": 500.0,
        "description": "Client 1 WhatsApp Campaign Commission"
    })

    ledger_res = await get_agency_billing_ledger(current_user=agency_user)
    assert ledger_res["totalDebits"] == 200.0
    assert ledger_res["totalCredits"] == 500.0
    assert ledger_res["netBalance"] == 300.0

# ─────────────────────────────────────────────────────────────────────────────
# 3. Self-Hosted Mode Regression Tests (APP_MODE="self_hosted")
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_self_hosted_mode_backwards_compatibility(mongo_client, monkeypatch):
    monkeypatch.setattr(settings, "APP_MODE", "self_hosted")

    db = mongo_client[TEST_DB_NAME]
    await db.legacy_customers.delete_many({})
    repo = TenantScopedRepository(db.legacy_customers, tenant_id=None)

    # In self-hosted mode, inserts do not require tenantId
    await repo.insert_one({"name": "Legacy Rathod Creation Customer", "phone": "919811111111"})

    doc = await repo.find_one({"phone": "919811111111"})
    assert doc is not None
    assert doc["name"] == "Legacy Rathod Creation Customer"
    assert doc.get("tenantId") is None

    # Count documents functions globally
    assert await repo.count_documents({}) == 1
