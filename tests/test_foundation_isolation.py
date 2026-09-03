"""
Foundation Phase Multi-Tenant Isolation & Security Test Suite.
Tests:
1. Field-level secret encryption & decryption (CryptoVault).
2. Generic TenantScopedRepository strict multi-tenant data segregation.
3. Aggregation guardrails ($unionWith, $out, $merge, $lookup, $graphLookup).
4. Legacy JWT rejection policy (tokens lacking tenantId in SaaS mode).
5. Channel entitlement enforcement (403 on unpurchased channels).
"""

import pytest
import pytest_asyncio
import asyncio
import os
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient

from app.config import settings
from app.utils.crypto_vault import crypto_vault
from app.repositories.base import TenantScopedRepository, TenantSecurityException
from app.utils.auth import create_access_token
from app.routes.auth import get_current_user
from app.utils.channel_guard import require_channel
from fastapi import HTTPException

# Test configuration
TEST_DB_NAME = "test_foundation_saas_db"
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")

@pytest.fixture(scope="function")
def mongo_client():
    client = AsyncIOMotorClient(MONGODB_URI)
    yield client
    client.close()

@pytest.fixture(autouse=True)
def set_saas_mode(monkeypatch):
    monkeypatch.setattr(settings, "APP_MODE", "saas")

# ─────────────────────────────────────────────────────────────────────────────
# 1. Field-Level Encryption Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_crypto_vault_encryption_decryption():
    raw_secret = "EAABwzL138290SECRET_META_TOKEN_12345"
    encrypted = crypto_vault.encrypt_secret(raw_secret)

    assert encrypted != raw_secret
    assert encrypted.startswith("enc::")

    decrypted = crypto_vault.decrypt_secret(encrypted)
    assert decrypted == raw_secret

def test_crypto_vault_legacy_plaintext_passthrough():
    plaintext = "legacy_plain_token_123"
    assert crypto_vault.decrypt_secret(plaintext) == plaintext

# ─────────────────────────────────────────────────────────────────────────────
# 2. Generic TenantScopedRepository Isolation Tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_scoped_repository_data_isolation(mongo_client):
    db = mongo_client[TEST_DB_NAME]
    coll = db.test_messages
    await coll.delete_many({})

    tenant_alpha_id = str(ObjectId())
    tenant_beta_id = str(ObjectId())

    repo_alpha = TenantScopedRepository(coll, tenant_alpha_id)
    repo_beta = TenantScopedRepository(coll, tenant_beta_id)

    # 1. Insert documents for Tenant Alpha
    await repo_alpha.insert_one({"text": "Alpha Secret Message 1", "author": "Alice"})
    await repo_alpha.insert_one({"text": "Alpha Secret Message 2", "author": "Alice"})

    # 2. Insert document for Tenant Beta
    await repo_beta.insert_one({"text": "Beta Secret Message 1", "author": "Bob"})

    # 3. Verify Alpha cannot see Beta's records
    alpha_msgs = await repo_alpha.find({})
    assert len(alpha_msgs) == 2
    assert all(m.get("tenantId") == tenant_alpha_id for m in alpha_msgs)
    assert not any("Beta" in m.get("text") for m in alpha_msgs)

    # 4. Verify Beta cannot see Alpha's records
    beta_msgs = await repo_beta.find({})
    assert len(beta_msgs) == 1
    assert beta_msgs[0].get("tenantId") == tenant_beta_id
    assert "Beta Secret Message 1" in beta_msgs[0].get("text")

    # 5. Verify count_documents is strictly isolated
    assert await repo_alpha.count_documents({}) == 2
    assert await repo_beta.count_documents({}) == 1

# ─────────────────────────────────────────────────────────────────────────────
# 3. Aggregation Guardrails Tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_aggregation_prohibited_stages_rejection(mongo_client):
    db = mongo_client[TEST_DB_NAME]
    coll = db.test_guardrails
    repo = TenantScopedRepository(coll, str(ObjectId()))

    # Attempt $unionWith cross-tenant leak
    with pytest.raises(TenantSecurityException, match="Prohibited aggregation stage"):
        await repo.aggregate([
            {"$unionWith": {"coll": "other_tenant_coll"}}
        ])

    # Attempt $out export
    with pytest.raises(TenantSecurityException, match="Prohibited aggregation stage"):
        await repo.aggregate([
            {"$out": "unauthorized_export"}
        ])

    # Attempt $merge
    with pytest.raises(TenantSecurityException, match="Prohibited aggregation stage"):
        await repo.aggregate([
            {"$merge": "target_coll"}
        ])

def test_aggregation_lookup_and_graphlookup_sanitization(mongo_client):
    db = mongo_client[TEST_DB_NAME]
    coll = db.test_graph_guard
    tenant_id = str(ObjectId())
    repo = TenantScopedRepository(coll, tenant_id)

    # $graphLookup without constraint should have constraint auto-injected
    pipeline = [
        {
            "$graphLookup": {
                "from": "customers",
                "startWith": "$referredBy",
                "connectFromField": "referredBy",
                "connectToField": "_id",
                "as": "referralTree"
            }
        }
    ]
    sanitized = repo._validate_and_sanitize_pipeline(pipeline)
    assert sanitized[0] == {"$match": {"tenantId": tenant_id}}
    graph_stage = sanitized[1]["$graphLookup"]
    assert graph_stage["restrictSearchWithMatch"]["tenantId"] == tenant_id

# ─────────────────────────────────────────────────────────────────────────────
# 4. Legacy JWT Rejection Policy Test
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_legacy_jwt_rejection_in_saas_mode():
    user_id = str(ObjectId())

    # Create legacy token lacking tenantId claim
    legacy_token = create_access_token(data={"id": user_id, "sub": user_id})

    # Assert get_current_user raises 401 Unauthorized
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(token=legacy_token)

    assert exc_info.value.status_code == 401
    assert "Legacy authentication token missing tenant context" in exc_info.value.detail

# ─────────────────────────────────────────────────────────────────────────────
# 5. Channel Entitlement Route Guard (403 Forbidden) Tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_channel_entitlement_route_guard(mongo_client):
    from app.database import db
    db.db = mongo_client[TEST_DB_NAME]

    tenant_id = ObjectId()
    # Create WhatsApp-only tenant
    await db.db.tenants.insert_one({
        "_id": tenant_id,
        "name": "WA Only Tenant",
        "enabledChannels": ["whatsapp"],
        "status": "active"
    })

    wa_user = {
        "_id": str(ObjectId()),
        "tenantId": str(tenant_id),
        "email": "user@waonly.com",
        "role": "tenant_owner"
    }

    wa_guard = require_channel("whatsapp")
    gmb_guard = require_channel("gbp")

    # Accessing WhatsApp channel succeeds
    assert await wa_guard(current_user=wa_user) is True

    # Accessing GBP channel on WhatsApp-only tenant raises 403 Forbidden
    with pytest.raises(HTTPException) as exc_info:
        await gmb_guard(current_user=wa_user)

    assert exc_info.value.status_code == 403
    assert "Channel 'gbp' is not enabled" in exc_info.value.detail
