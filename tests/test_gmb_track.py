"""
Google Business Profile (GMB / GBP) Channel & Unified Leads CRM Test Suite.
Tests:
1. Encrypted GBPConnection credential storage in gbp_connections.
2. AI-generated and manual review reply workflows.
3. GBP promotional post scheduling.
4. Unified Leads CRM multi-channel source attribution & tenant isolation.
5. Leads analytics aggregation by source_channel and pipeline status.
"""

import pytest
import os
from datetime import datetime, timezone
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient

from app.config import settings
from app.models.channels.gmb import GBPConnection, GBPReview, GBPPost
from app.models.lead import Lead
from app.repositories.base import TenantScopedRepository
from app.services.ai_engine import ai_engine

TEST_DB_NAME = "test_gmb_track_db"
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
# 1. GBP Connection & Secret Encryption Tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_gbp_connection_encryption(mongo_client):
    db = mongo_client[TEST_DB_NAME]
    coll = db.gbp_connections
    await coll.delete_many({})

    tenant_id = str(ObjectId())
    raw_oauth_token = "ya29.a0AfH6SM_SECRET_GOOGLE_OAUTH_ACCESS_TOKEN"
    raw_refresh_token = "1//0g_SECRET_REFRESH_TOKEN_GMB"

    conn = GBPConnection.create_encrypted(
        tenant_id=tenant_id,
        location_id="locations/1234567890",
        location_name="Rathod Fabrics Flagship Store",
        access_token=raw_oauth_token,
        refresh_token=raw_refresh_token,
        account_name="accounts/987654321",
        address="100 Commercial St, Surat, Gujarat"
    )

    doc = conn.model_dump(by_alias=True)
    assert doc["accessTokenEncrypted"].startswith("enc::")
    assert raw_oauth_token not in doc["accessTokenEncrypted"]
    assert doc["refreshTokenEncrypted"].startswith("enc::")

    await coll.insert_one(doc)

    fetched = await coll.find_one({"locationId": "locations/1234567890"})
    conn_obj = GBPConnection(**fetched)

    assert conn_obj.get_decrypted_access_token() == raw_oauth_token
    assert conn_obj.get_decrypted_refresh_token() == raw_refresh_token

# ─────────────────────────────────────────────────────────────────────────────
# 2. AI Review Reply & Sentiment Adaptation Tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ai_review_reply_sentiment_adaptation():
    # 5-Star Review: Gratitude & delight
    reply_5_star = await ai_engine.generate_review_reply(
        business_name="Aura Boutique",
        reviewer_name="Sneha Patel",
        star_rating=5,
        review_text="Amazing fabric quality and prompt delivery!"
    )
    assert "Sneha Patel" in reply_5_star
    assert "Aura Boutique" in reply_5_star
    assert "thrilled" in reply_5_star.lower() or "thank you" in reply_5_star.lower()

    # 1-Star Review: Apology & remediation
    reply_1_star = await ai_engine.generate_review_reply(
        business_name="Aura Boutique",
        reviewer_name="Rahul Verma",
        star_rating=1,
        review_text="Received defective item."
    )
    assert "Rahul Verma" in reply_1_star
    assert "sorry" in reply_1_star.lower() or "management" in reply_1_star.lower()

# ─────────────────────────────────────────────────────────────────────────────
# 3. GBP Promotional Posts Tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_gbp_post_lifecycle(mongo_client):
    db = mongo_client[TEST_DB_NAME]
    tenant_id = str(ObjectId())
    post_repo = TenantScopedRepository(db.gbp_posts, tenant_id)

    post_doc = {
        "locationId": "locations/1234567890",
        "topicType": "OFFER",
        "summary": "🎉 Flat 20% off on all wholesale cotton rolls this weekend! Visit us in-store.",
        "callToActionType": "SHOP",
        "callToActionUrl": "https://auraboutique.com/sale",
        "status": "published",
        "sourceChannel": "gbp_post",
        "createdAt": datetime.now(timezone.utc),
        "updatedAt": datetime.now(timezone.utc),
    }

    result = await post_repo.insert_one(post_doc)
    assert result.inserted_id is not None

    posts = await post_repo.find({"topicType": "OFFER"})
    assert len(posts) == 1
    assert posts[0]["tenantId"] == tenant_id
    assert posts[0]["callToActionType"] == "SHOP"

# ─────────────────────────────────────────────────────────────────────────────
# 4. Unified Leads CRM Multi-Channel Attribution & Isolation Tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_leads_crm_multi_channel_attribution(mongo_client):
    db = mongo_client[TEST_DB_NAME]
    coll = db.leads
    await coll.delete_many({})

    tenant_alpha = str(ObjectId())
    tenant_beta = str(ObjectId())

    repo_alpha = TenantScopedRepository(coll, tenant_alpha)
    repo_beta = TenantScopedRepository(coll, tenant_beta)

    # 1. Tenant Alpha leads across channels
    await repo_alpha.insert_one({
        "name": "Anil Kumar (WhatsApp Inquiry)",
        "phone": "919811111111",
        "sourceChannel": "whatsapp",
        "status": "new",
        "estimatedValue": 15000.0,
    })

    await repo_alpha.insert_one({
        "name": "Pooja Sharma (5-Star Google Reviewer)",
        "phone": "919822222222",
        "sourceChannel": "gbp_review",
        "status": "qualified",
        "estimatedValue": 50000.0,
    })

    await repo_alpha.insert_one({
        "name": "Vikram Singh (Storefront QR Scan)",
        "phone": "919833333333",
        "sourceChannel": "gbp_qr",
        "status": "converted",
        "estimatedValue": 80000.0,
    })

    # 2. Tenant Beta lead
    await repo_beta.insert_one({
        "name": "Karan Johar (Wholesale Sync)",
        "phone": "919844444444",
        "sourceChannel": "ecommerce_admin",
        "status": "new",
        "estimatedValue": 25000.0,
    })

    # 3. Verify Alpha tenant isolation
    alpha_leads = await repo_alpha.find({})
    assert len(alpha_leads) == 3
    assert all(l["tenantId"] == tenant_alpha for l in alpha_leads)
    assert not any("Karan Johar" in l["name"] for l in alpha_leads)

    # 4. Verify channel filtering
    wa_leads = await repo_alpha.find({"sourceChannel": "whatsapp"})
    assert len(wa_leads) == 1
    assert wa_leads[0]["name"] == "Anil Kumar (WhatsApp Inquiry)"

    qr_leads = await repo_alpha.find({"sourceChannel": "gbp_qr"})
    assert len(qr_leads) == 1
    assert qr_leads[0]["status"] == "converted"

    # 5. Verify analytics summary aggregation
    channel_agg = await repo_alpha.aggregate([
        {"$group": {"_id": "$sourceChannel", "count": {"$sum": 1}}}
    ])
    by_channel = {d["_id"]: d["count"] for d in channel_agg}
    assert by_channel.get("whatsapp") == 1
    assert by_channel.get("gbp_review") == 1
    assert by_channel.get("gbp_qr") == 1
    assert by_channel.get("ecommerce_admin") is None

# ─────────────────────────────────────────────────────────────────────────────
# 5. Google Business Profile Sync Engine Test
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_gbp_sync_engine_upsert(mongo_client, monkeypatch):
    from unittest.mock import AsyncMock, MagicMock
    from app.routes.gmb import sync_google_reviews
    from app.database import db

    test_db = mongo_client[TEST_DB_NAME]
    monkeypatch.setattr(db, "db", test_db)

    tenant_id = str(ObjectId())
    await test_db.gbp_connections.delete_many({})
    await test_db.gbp_reviews.delete_many({})

    # Seed encrypted connection
    conn = GBPConnection.create_encrypted(
        tenant_id=tenant_id,
        location_id="loc_initial",
        location_name="Initial Store",
        access_token="test_mock_google_token",
        token_expires_at=datetime.now(timezone.utc)
    )
    doc = conn.model_dump(by_alias=True)
    await test_db.gbp_connections.insert_one(doc)

    # Mock get_http_client
    mock_client = MagicMock()
    
    # Mock accounts response
    accounts_resp = MagicMock()
    accounts_resp.status_code = 200
    accounts_resp.json.return_value = {"accounts": [{"name": "accounts/112233"}]}

    # Mock locations response
    locations_resp = MagicMock()
    locations_resp.status_code = 200
    locations_resp.json.return_value = {"locations": [{
        "name": "locations/998877",
        "title": "Aura Boutique Flagship",
        "storefrontAddress": {"addressLines": ["12 MG Road"], "locality": "Mumbai"}
    }]}

    # Mock reviews response
    reviews_resp = MagicMock()
    reviews_resp.status_code = 200
    reviews_resp.json.return_value = {"reviews": [{
        "reviewId": "rev_mock_sync_101",
        "reviewer": {"displayName": "Rhea Kapoor"},
        "starRating": "FIVE",
        "comment": "Absolutely love the bespoke festive collection!",
        "createTime": "2026-09-01T10:00:00Z"
    }]}

    async def mock_get(url, **kwargs):
        if "accounts" in url and "locations" not in url:
            return accounts_resp
        elif "locations" in url and "reviews" not in url:
            return locations_resp
        elif "reviews" in url:
            return reviews_resp
        return MagicMock(status_code=404)

    mock_client.get = AsyncMock(side_effect=mock_get)
    monkeypatch.setattr("app.routes.gmb.get_http_client", lambda: mock_client)

    # Execute sync
    user = {"_id": str(ObjectId()), "tenantId": tenant_id, "email": "aura@boutique.com"}
    res = await sync_google_reviews(current_user=user)

    assert res["syncedReviews"] == 1
    assert "Aura Boutique Flagship" in res["locations"]

    # Verify review in database
    review_in_db = await test_db.gbp_reviews.find_one({"reviewId": "rev_mock_sync_101"})
    assert review_in_db is not None
    assert review_in_db["tenantId"] == tenant_id
    assert review_in_db["reviewerName"] == "Rhea Kapoor"
    assert review_in_db["starRating"] == 5
    assert review_in_db["sourceChannel"] == "gbp_review"

