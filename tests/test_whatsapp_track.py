"""
WhatsApp Track Multi-Tenant & Encryption Test Suite.
Tests:
1. WhatsAppConnection model encrypted credential storage in wa_connections.
2. Dynamic webhook tenant routing by phoneNumberId.
3. Meta HMAC-SHA256 signature verification with tenant-specific decrypted app secret.
4. Inbound webhook message isolation between Tenant Alpha and Tenant Beta.
"""

import pytest
import asyncio
import os
import hmac
import hashlib
import json
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient

from app.config import settings
from app.models.channels.whatsapp import WhatsAppConnection
from app.utils.crypto_vault import crypto_vault
from app.utils.tenant import resolve_webhook_tenant, resolve_webhook_connection
from app.routes.webhook import _verify_meta_signature, _process_webhook_body
from app.repositories.base import TenantScopedRepository

TEST_DB_NAME = "test_whatsapp_track_db"
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
# 1. WhatsAppConnection Encrypted Storage Tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_whatsapp_connection_encryption_storage(mongo_client):
    from app.database import db
    db.db = mongo_client[TEST_DB_NAME]
    await db.db.wa_connections.delete_many({})

    tenant_id = str(ObjectId())
    raw_token = "EAABwz_META_SECRET_ACCESS_TOKEN_XYZ"
    raw_secret = "app_secret_1234567890abcdef"
    raw_verify = "custom_verify_token_alpha"

    conn = WhatsAppConnection.create_encrypted(
        tenant_id=tenant_id,
        phone_number_id="1098765432101",
        waba_id="9876543210987",
        access_token=raw_token,
        app_secret=raw_secret,
        verify_token=raw_verify,
        display_phone_number="+91 98765 43210"
    )

    doc = conn.model_dump(by_alias=True)
    assert doc["accessTokenEncrypted"].startswith("enc::")
    assert doc["appSecretEncrypted"].startswith("enc::")
    assert raw_token not in doc["accessTokenEncrypted"]

    # Insert into database
    await db.db.wa_connections.insert_one(doc)

    # Fetch and verify decryption
    fetched = await db.db.wa_connections.find_one({"phoneNumberId": "1098765432101"})
    assert fetched is not None
    conn_obj = WhatsAppConnection(**fetched)

    assert conn_obj.get_decrypted_access_token() == raw_token
    assert conn_obj.get_decrypted_app_secret() == raw_secret
    assert conn_obj.get_decrypted_verify_token() == raw_verify

# ─────────────────────────────────────────────────────────────────────────────
# 2. Dynamic Webhook Tenant Resolution & Signature Tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_dynamic_webhook_routing_and_signature(mongo_client):
    from app.database import db
    db.db = mongo_client[TEST_DB_NAME]

    tenant_alpha = str(ObjectId())
    phone_id_alpha = "phone_alpha_111"
    app_secret_alpha = "secret_alpha_999"

    conn_alpha = WhatsAppConnection.create_encrypted(
        tenant_id=tenant_alpha,
        phone_number_id=phone_id_alpha,
        waba_id="waba_111",
        access_token="tok_alpha",
        app_secret=app_secret_alpha
    )
    await db.db.wa_connections.insert_one(conn_alpha.model_dump())

    # 1. Test tenant resolution
    resolved_tenant = await resolve_webhook_tenant(phone_id_alpha)
    assert resolved_tenant == tenant_alpha

    # 2. Test decrypted connection resolution
    resolved_conn = await resolve_webhook_connection(phone_id_alpha)
    assert resolved_conn["tenantId"] == tenant_alpha
    assert resolved_conn["appSecret"] == app_secret_alpha

    # 3. Test HMAC-SHA256 signature verification
    payload_bytes = b'{"object": "whatsapp_business_account"}'
    valid_sig = "sha256=" + hmac.new(app_secret_alpha.encode(), payload_bytes, hashlib.sha256).hexdigest()
    assert _verify_meta_signature(payload_bytes, valid_sig, app_secret_alpha) is True

    # Tampered signature fails
    assert _verify_meta_signature(payload_bytes, "sha256=invalidhash", app_secret_alpha) is False

# ─────────────────────────────────────────────────────────────────────────────
# 3. Multi-Tenant Inbound Webhook Message Isolation
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_multi_tenant_inbound_webhook_isolation(mongo_client):
    from app.database import db
    db.db = mongo_client[TEST_DB_NAME]
    await db.db.conversations.delete_many({})
    await db.db.messages.delete_many({})
    await db.db.customers.delete_many({})

    tenant_alpha_id = str(ObjectId())
    tenant_beta_id = str(ObjectId())

    # Register connections for both tenants
    await db.db.wa_connections.insert_one({
        "tenantId": tenant_alpha_id,
        "phoneNumberId": "wa_phone_alpha",
        "wabaId": "waba_alpha",
        "accessTokenEncrypted": crypto_vault.encrypt_secret("tok_a"),
    })

    await db.db.wa_connections.insert_one({
        "tenantId": tenant_beta_id,
        "phoneNumberId": "wa_phone_beta",
        "wabaId": "waba_beta",
        "accessTokenEncrypted": crypto_vault.encrypt_secret("tok_b"),
    })

    # Simulate inbound payload for Tenant Alpha
    payload_alpha = {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "waba_alpha",
            "changes": [{
                "field": "messages",
                "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {"phone_number_id": "wa_phone_alpha"},
                    "contacts": [{"profile": {"name": "Alice Customer"}, "wa_id": "919811111111"}],
                    "messages": [{
                        "from": "919811111111",
                        "id": "wamid_alpha_001",
                        "timestamp": "1710000000",
                        "type": "text",
                        "text": {"body": "Hello Alpha Business"}
                    }]
                }
            }]
        }]
    }

    # Simulate inbound payload for Tenant Beta
    payload_beta = {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "waba_beta",
            "changes": [{
                "field": "messages",
                "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {"phone_number_id": "wa_phone_beta"},
                    "contacts": [{"profile": {"name": "Bob Customer"}, "wa_id": "919822222222"}],
                    "messages": [{
                        "from": "919822222222",
                        "id": "wamid_beta_001",
                        "timestamp": "1710000000",
                        "type": "text",
                        "text": {"body": "Hello Beta Business"}
                    }]
                }
            }]
        }]
    }

    await _process_webhook_body(payload_alpha)
    await _process_webhook_body(payload_beta)

    # Verify Tenant Alpha Repository only sees Alpha conversation and messages
    alpha_conv_repo = TenantScopedRepository(db.db.conversations, tenant_alpha_id)
    alpha_msg_repo = TenantScopedRepository(db.db.messages, tenant_alpha_id)

    alpha_convs = await alpha_conv_repo.find({})
    assert len(alpha_convs) == 1
    assert alpha_convs[0]["customerPhone"] == "919811111111"
    assert alpha_convs[0]["tenantId"] == tenant_alpha_id

    alpha_msgs = await alpha_msg_repo.find({})
    assert len(alpha_msgs) == 1
    assert alpha_msgs[0]["content"]["text"] == "Hello Alpha Business"
    assert alpha_msgs[0]["tenantId"] == tenant_alpha_id

    # Verify Tenant Beta Repository only sees Beta conversation and messages
    beta_conv_repo = TenantScopedRepository(db.db.conversations, tenant_beta_id)
    beta_msg_repo = TenantScopedRepository(db.db.messages, tenant_beta_id)

    beta_convs = await beta_conv_repo.find({})
    assert len(beta_convs) == 1
    assert beta_convs[0]["customerPhone"] == "919822222222"
    assert beta_convs[0]["tenantId"] == tenant_beta_id

    beta_msgs = await beta_msg_repo.find({})
    assert len(beta_msgs) == 1
    assert beta_msgs[0]["content"]["text"] == "Hello Beta Business"
    assert beta_msgs[0]["tenantId"] == tenant_beta_id
