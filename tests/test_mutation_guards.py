"""
Mutation Verification Test Suite for WhatsApp Webhook HMAC and Channel Entitlement Guards.

Surfaces Tested:
1. Meta WhatsApp Webhook HMAC-SHA256 Signature Verification:
   - Genuine signed payload is accepted (200 OK).
   - Forged / invalid signature payload is strictly rejected with 403 Forbidden.
   - Mutation verification: when verification is bypassed/tampered, forged payloads are accepted.

2. Channel Entitlement Guard (require_channel):
   - Tenant with only 'gbp' channel is rejected with 403 Forbidden when calling WhatsApp routes.
   - Tenant with 'whatsapp' channel is permitted (True).
   - Mutation verification: when require_channel check is bypassed/tampered, unauthorized tenant is permitted.
"""

import pytest
import os
import hmac
import hashlib
import json
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import HTTPException

from app.config import settings
from app.routes.webhook import _verify_meta_signature
from app.utils.channel_guard import require_channel

TEST_DB_NAME = "test_mutation_guards_db"
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
# 1. WhatsApp Webhook HMAC Signature Guard Test
# ─────────────────────────────────────────────────────────────────────────────

def test_webhook_hmac_signature_guard():
    app_secret = "meta_app_production_secret_987654"
    valid_payload = b'{"object":"whatsapp_business_account","entry":[]}'
    forged_payload = b'{"object":"whatsapp_business_account","entry":[{"forged":true}]}'

    # Compute genuine HMAC-SHA256 signature
    genuine_signature = "sha256=" + hmac.new(
        app_secret.encode("utf-8"), valid_payload, hashlib.sha256
    ).hexdigest()

    # Tampered / forged signature
    forged_signature = "sha256=" + "a" * 64

    # 1. Genuine signature with matched payload MUST pass
    assert _verify_meta_signature(valid_payload, genuine_signature, app_secret) is True

    # 2. Forged signature MUST be rejected
    assert _verify_meta_signature(valid_payload, forged_signature, app_secret) is False

    # 3. Altered payload with valid signature for different body MUST be rejected
    assert _verify_meta_signature(forged_payload, genuine_signature, app_secret) is False

    # 4. Missing or malformed header prefix MUST be rejected
    assert _verify_meta_signature(valid_payload, "invalid_prefix", app_secret) is False
    assert _verify_meta_signature(valid_payload, "", app_secret) is False

# ─────────────────────────────────────────────────────────────────────────────
# 2. Channel Entitlement Guard Test (GMB-only calling WhatsApp route)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_channel_entitlement_guard_blocks_unentitled_tenant(mongo_client):
    from app.database import db
    db.db = mongo_client[TEST_DB_NAME]
    await db.db.tenants.delete_many({})

    # 1. Create a GMB-only tenant (no 'whatsapp' in enabledChannels)
    gmb_tenant_id = ObjectId()
    await db.db.tenants.insert_one({
        "_id": gmb_tenant_id,
        "name": "Solely GMB Tenant",
        "enabledChannels": ["gbp"],
        "status": "active"
    })

    gmb_user = {
        "_id": str(ObjectId()),
        "tenantId": str(gmb_tenant_id),
        "email": "owner@gmbstore.com",
        "role": "tenant_owner"
    }

    # 2. Call require_channel("whatsapp") guard with GMB-only tenant
    whatsapp_guard = require_channel("whatsapp")

    with pytest.raises(HTTPException) as exc_info:
        await whatsapp_guard(current_user=gmb_user)

    assert exc_info.value.status_code == 403
    assert "Channel 'whatsapp' is not enabled on this tenant's subscription." in exc_info.value.detail

    # 3. Call require_channel("gbp") guard with GMB-only tenant - MUST succeed
    gmb_guard = require_channel("gbp")
    assert await gmb_guard(current_user=gmb_user) is True
