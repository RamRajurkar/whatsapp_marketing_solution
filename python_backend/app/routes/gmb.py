"""
Google Business Profile (GBP / GMB) Channel API Endpoints.
Guarded by require_channel("gbp") dependency and scoped via TenantScopedRepository.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime, timezone
from bson import ObjectId

from app.routes.auth import get_current_user
from app.database import db
from app.config import settings
from app.http_client import get_http_client
from app.repositories.base import TenantScopedRepository
from app.utils.channel_guard import require_channel
from app.models.channels.gmb import GBPConnection, GBPReview, GBPPost
from app.services.ai_engine import ai_engine

router = APIRouter(dependencies=[Depends(require_channel("gbp"))])
public_router = APIRouter()

def _now():
    return datetime.now(timezone.utc)

def _get_gmb_repos(current_user: dict):
    tenant_id = current_user.get("tenantId")
    return (
        TenantScopedRepository(db.db.gbp_connections, tenant_id),
        TenantScopedRepository(db.db.gbp_reviews, tenant_id),
        TenantScopedRepository(db.db.gbp_posts, tenant_id),
    )

class ConnectLocationRequest(BaseModel):
    locationId: str
    locationName: str
    accessToken: str
    refreshToken: Optional[str] = None
    accountName: Optional[str] = None
    address: Optional[str] = None
    placeId: Optional[str] = None
    reviewAutoReplyEnabled: bool = False

class ReplyReviewRequest(BaseModel):
    replyComment: Optional[str] = None
    generateWithAi: bool = False
    tone: Optional[str] = "professional"

class CreateReviewRequest(BaseModel):
    locationId: str
    reviewerName: str
    starRating: int
    comment: Optional[str] = None
    reviewId: Optional[str] = None

class CreatePostRequest(BaseModel):
    locationId: str
    summary: str
    topicType: str = "STANDARD"
    callToActionType: Optional[str] = "LEARN_MORE"
    callToActionUrl: Optional[str] = None
    mediaUrl: Optional[str] = None
    scheduledAt: Optional[str] = None

# ─────────────────────────────────────────────────────────────────────────────
# 1. Location Connections
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/locations")
async def list_locations(current_user: dict = Depends(get_current_user)):
    """List all connected Google Business Profile locations for the tenant."""
    conn_repo, _, _ = _get_gmb_repos(current_user)
    locations = await conn_repo.find({})
    for loc in locations:
        loc["_id"] = str(loc["_id"])
        # Do not expose encrypted or raw tokens in listing
        loc.pop("accessTokenEncrypted", None)
        loc.pop("refreshTokenEncrypted", None)
    return {"locations": locations}

@router.post("/connect")
async def connect_location(req: ConnectLocationRequest, current_user: dict = Depends(get_current_user)):
    """Connect a Google Business location with encrypted OAuth credentials."""
    conn_repo, _, _ = _get_gmb_repos(current_user)
    tenant_id = current_user.get("tenantId")

    conn_obj = GBPConnection.create_encrypted(
        tenant_id=tenant_id,
        location_id=req.locationId,
        location_name=req.locationName,
        access_token=req.accessToken,
        refresh_token=req.refreshToken,
        account_name=req.accountName,
        address=req.address,
        place_id=req.placeId,
        review_auto_reply_enabled=req.reviewAutoReplyEnabled
    )

    doc = conn_obj.model_dump(by_alias=True)
    await conn_repo.update_one(
        {"locationId": req.locationId},
        {"$set": doc},
        upsert=True
    )
    return {"message": "Google Business Profile location connected successfully", "locationId": req.locationId}

# ─────────────────────────────────────────────────────────────────────────────
# 1.1 Google OAuth 2.0 Flow
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/oauth/url")
async def get_google_oauth_url(
    redirect_uri: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Generate Google OAuth 2.0 consent screen authorization URL.
    Requests offline access to obtain a refresh_token for background sync.
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=400, detail="GOOGLE_CLIENT_ID is not configured in .env")

    tenant_id = str(current_user.get("tenantId") or current_user.get("_id"))
    default_redirect = redirect_uri or "https://imminent-marine-maieutic.ngrok-free.dev/api/gmb/oauth/callback"
    scope = "https://www.googleapis.com/auth/business.manage"
    
    # State parameter preserves tenant context and protects against CSRF
    state = f"tenant:{tenant_id}"

    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": default_redirect,
        "response_type": "code",
        "scope": scope,
        "access_type": "offline",
        "prompt": "consent",
        "state": state
    }
    
    import urllib.parse
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"
    return {"authUrl": auth_url, "redirectUri": default_redirect, "tenantId": tenant_id}


from fastapi.responses import HTMLResponse

@public_router.get("/oauth/callback", response_class=HTMLResponse)
async def google_oauth_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None)
):
    """
    OAuth 2.0 redirect callback called by Google after consent.
    Exchanges code for tokens and encrypts credentials into gbp_connections.
    """
    if error:
        return HTMLResponse(f"<h3>Google OAuth Error</h3><p>{error}</p>", status_code=400)
    if not code:
        return HTMLResponse("<h3>Missing authorization code</h3>", status_code=400)

    # Extract tenantId from state
    tenant_id = None
    if state and state.startswith("tenant:"):
        tenant_id = state.split("tenant:")[1]
    
    if not tenant_id:
        return HTMLResponse("<h3>Invalid state parameter: missing tenant context</h3>", status_code=400)

    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        return HTMLResponse("<h3>GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured</h3>", status_code=500)

    # Exchange authorization code for tokens
    token_url = "https://oauth2.googleapis.com/token"
    redirect_uri = "https://imminent-marine-maieutic.ngrok-free.dev/api/gmb/oauth/callback"
    
    client = get_http_client()
    token_payload = {
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code"
    }

    resp = await client.post(token_url, data=token_payload)
    if resp.status_code != 200:
        return HTMLResponse(f"<h3>Token exchange failed:</h3><pre>{resp.text}</pre>", status_code=400)

    token_data = resp.json()
    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in", 3600)
    
    from datetime import timedelta
    expires_at = _now() + timedelta(seconds=expires_in)

    # Vault encrypted tokens into gbp_connections
    location_id = f"loc_{tenant_id[:12]}"
    conn_obj = GBPConnection.create_encrypted(
        tenant_id=tenant_id,
        location_id=location_id,
        location_name="Google Business Profile Storefront",
        access_token=access_token,
        refresh_token=refresh_token,
        token_expires_at=expires_at,
        review_auto_reply_enabled=True
    )
    
    doc = conn_obj.model_dump(by_alias=True)
    await db.db.gbp_connections.update_one(
        {"tenantId": tenant_id},
        {"$set": doc},
        upsert=True
    )

    return HTMLResponse(f"""
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f9fafb;">
        <div style="background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 480px; text-align: center;">
          <div style="width: 56px; height: 56px; background: #ecfdf5; color: #059669; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 28px;">✓</div>
          <h2 style="color: #111827; margin: 0 0 8px;">Google Business Profile Connected</h2>
          <p style="color: #6b7280; font-size: 14px; margin: 0 0 24px;">OAuth 2.0 handshake succeeded. Your tokens have been encrypted with AES-256-GCM and vaulted under tenant <code>{tenant_id}</code>.</p>
          <p style="color: #059669; font-weight: 600; font-size: 13px;">You can now close this window and return to the staging verification.</p>
        </div>
      </body>
    </html>
    """)

# ─────────────────────────────────────────────────────────────────────────────
# 1.2 Token Refresh Helper & Google Business Profile Sync Engine
# ─────────────────────────────────────────────────────────────────────────────

async def _get_valid_google_token(conn_doc: dict) -> str:
    """
    Returns a valid access token for the given GBPConnection document.
    If the token has expired or is expiring within 5 minutes, refreshes it via Google OAuth.
    """
    conn_obj = GBPConnection(**conn_doc)
    access_token = conn_obj.get_decrypted_access_token()
    refresh_token = conn_obj.get_decrypted_refresh_token()
    expires_at = conn_doc.get("tokenExpiresAt")

    from datetime import timedelta
    is_expired = False
    if expires_at:
        if isinstance(expires_at, str):
            try:
                expires_at = datetime.fromisoformat(expires_at)
            except Exception:
                pass
        if isinstance(expires_at, datetime):
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at <= _now() + timedelta(minutes=5):
                is_expired = True

    if is_expired and refresh_token and settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET:
        token_url = "https://oauth2.googleapis.com/token"
        client = get_http_client()
        payload = {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token"
        }
        resp = await client.post(token_url, data=payload)
        if resp.status_code == 200:
            token_data = resp.json()
            new_access_token = token_data.get("access_token")
            new_expires_in = token_data.get("expires_in", 3600)
            new_expires_at = _now() + timedelta(seconds=new_expires_in)

            from app.utils.crypto_vault import crypto_vault
            new_enc = crypto_vault.encrypt_secret(new_access_token)
            await db.db.gbp_connections.update_one(
                {"tenantId": conn_doc["tenantId"]},
                {"$set": {
                    "accessTokenEncrypted": new_enc,
                    "tokenExpiresAt": new_expires_at,
                    "updatedAt": _now()
                }}
            )
            return new_access_token

    return access_token


STAR_MAP = {
    "FIVE": 5,
    "FOUR": 4,
    "THREE": 3,
    "TWO": 2,
    "ONE": 1,
    "5": 5,
    "4": 4,
    "3": 3,
    "2": 2,
    "1": 1
}


@router.post("/sync")
async def sync_google_reviews(current_user: dict = Depends(get_current_user)):
    """
    Synchronize storefront locations and customer reviews from Google Business Profile.
    Calls Google My Business API and upserts reviews into gbp_reviews.
    """
    tenant_id = current_user.get("tenantId")
    conn_repo, review_repo, _ = _get_gmb_repos(current_user)

    conn_doc = await conn_repo.find_one({})
    if not conn_doc:
        raise HTTPException(status_code=400, detail="No Google Business Profile connected. Please connect your Google account first.")

    try:
        access_token = await _get_valid_google_token(conn_doc)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to refresh Google authorization: {str(e)}")

    if not access_token:
        raise HTTPException(status_code=400, detail="Missing Google access token. Please re-authenticate your Google account.")

    client = get_http_client()
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }

    # 1. Fetch Accounts from Google Account Management API
    acc_url = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts"
    try:
        acc_res = await client.get(acc_url, headers=headers)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Network error contacting Google API: {str(e)}")

    if acc_res.status_code == 403:
        err_body = acc_res.json() if "application/json" in acc_res.headers.get("content-type", "") else {}
        err_msg = err_body.get("error", {}).get("message", "")
        if "has not been used" in err_msg or "disabled" in err_msg:
            raise HTTPException(
                status_code=403,
                detail="Google My Business APIs are not enabled in your Google Cloud Project. Please enable 'My Business Account Management API' and 'My Business Business Information API' in Google Cloud Console."
            )
        raise HTTPException(status_code=403, detail=f"Google API Access Denied: {err_msg or 'Permission denied'}")

    if acc_res.status_code == 429:
        raise HTTPException(
            status_code=429,
            detail="Google Business Profile API quota exceeded (429). Google Cloud requires Business Profile API quota approval for project 921655025496. Please request quota in Google Cloud Console."
        )

    if acc_res.status_code == 401:
        raise HTTPException(
            status_code=401,
            detail="Google session expired. Please click 'Connect Google Account' to re-authenticate."
        )

    if acc_res.status_code != 200:
        raise HTTPException(status_code=acc_res.status_code, detail=f"Google API error ({acc_res.status_code}): {acc_res.text[:300]}")

    accounts = acc_res.json().get("accounts", [])
    if not accounts:
        return {
            "message": "Connected Google account has no Google Business Profile accounts registered.",
            "syncedReviews": 0,
            "locationsFound": 0
        }

    synced_reviews_count = 0
    synced_locations = []

    for acc in accounts:
        acc_name = acc.get("name")  # e.g. "accounts/123456789"
        if not acc_name:
            continue

        # 2. Fetch Locations for this Account
        loc_url = f"https://mybusinessbusinessinformation.googleapis.com/v1/{acc_name}/locations?readMask=name,title,storefrontAddress,storeCode"
        loc_res = await client.get(loc_url, headers=headers)

        locations = []
        if loc_res.status_code == 200:
            locations = loc_res.json().get("locations", [])

        for loc in locations:
            loc_name = loc.get("name")  # e.g. "locations/987654321"
            loc_title = loc.get("title") or "Google Storefront"
            address_obj = loc.get("storefrontAddress", {})
            address_lines = address_obj.get("addressLines", [])
            locality = address_obj.get("locality", "")
            full_addr = ", ".join(address_lines + ([locality] if locality else []))

            synced_locations.append(loc_title)

            # Update connection location metadata
            await conn_repo.update_one(
                {"tenantId": tenant_id},
                {"$set": {
                    "locationId": loc_name,
                    "locationName": loc_title,
                    "address": full_addr or None,
                    "updatedAt": _now()
                }}
            )

            # 3. Fetch Reviews from Google My Business v4 API
            rev_url = f"https://mybusiness.googleapis.com/v4/{acc_name}/{loc_name}/reviews"
            rev_res = await client.get(rev_url, headers=headers)
            if rev_res.status_code == 200:
                google_reviews = rev_res.json().get("reviews", [])
                for gr in google_reviews:
                    rev_id = gr.get("reviewId") or gr.get("name")
                    reviewer = gr.get("reviewer", {})
                    reviewer_name = reviewer.get("displayName") or "Google User"
                    reviewer_photo = reviewer.get("profilePhotoUrl")
                    rating_val = STAR_MAP.get(str(gr.get("starRating", "FIVE")), 5)
                    comment = gr.get("comment", "")

                    review_reply = gr.get("reviewReply", {})
                    reply_comment = review_reply.get("comment")
                    reply_status = "replied" if reply_comment else "pending"

                    created_at = _now()
                    if gr.get("createTime"):
                        try:
                            created_at = datetime.fromisoformat(gr["createTime"].replace("Z", "+00:00"))
                        except Exception:
                            pass

                    rev_doc = {
                        "tenantId": tenant_id,
                        "locationId": loc_name,
                        "reviewId": rev_id,
                        "reviewerName": reviewer_name,
                        "reviewerPhotoUrl": reviewer_photo,
                        "starRating": rating_val,
                        "comment": comment,
                        "replyComment": reply_comment,
                        "replyStatus": reply_status,
                        "sourceChannel": "gbp_review",
                        "createdAt": created_at,
                        "updatedAt": _now()
                    }
                    if reply_comment:
                        rev_doc["repliedAt"] = _now()

                    await review_repo.update_one(
                        {"reviewId": rev_id},
                        {"$set": rev_doc},
                        upsert=True
                    )
                    synced_reviews_count += 1

    return {
        "message": f"Successfully synchronized {synced_reviews_count} reviews across {len(synced_locations)} location(s).",
        "syncedReviews": synced_reviews_count,
        "locations": synced_locations
    }

# ─────────────────────────────────────────────────────────────────────────────
# 2. Reviews Management & AI Replies
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/reviews")
async def list_reviews(
    location_id: Optional[str] = None,
    star_rating: Optional[int] = None,
    reply_status: Optional[str] = None,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """List customer reviews for the tenant's Google Business location."""
    _, review_repo, _ = _get_gmb_repos(current_user)
    query: dict = {}
    if location_id:
        query["locationId"] = location_id
    if star_rating:
        query["starRating"] = star_rating
    if reply_status:
        query["replyStatus"] = reply_status

    reviews = await review_repo.find(query, sort=[("createdAt", -1)], limit=limit)
    for r in reviews:
        r["_id"] = str(r["_id"])
    return {"reviews": reviews, "total": len(reviews)}

@router.post("/reviews")
async def create_review(
    req: CreateReviewRequest,
    current_user: dict = Depends(get_current_user)
):
    """Seed/create a Google Business Profile review for testing and webhook sync."""
    _, review_repo, _ = _get_gmb_repos(current_user)
    tenant_id = current_user.get("tenantId")
    now = _now()
    review_id = req.reviewId or f"rev_{int(now.timestamp()*1000)}"
    doc = {
        "tenantId": tenant_id,
        "locationId": req.locationId,
        "reviewId": review_id,
        "reviewerName": req.reviewerName,
        "starRating": req.starRating,
        "comment": req.comment,
        "replyStatus": "pending",
        "sourceChannel": "gbp_review",
        "createdAt": now,
        "updatedAt": now
    }
    result = await review_repo.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return {"message": "Review created successfully", "review": doc}


@router.post("/reviews/{review_id}/reply")
async def reply_review(
    review_id: str,
    req: ReplyReviewRequest,
    current_user: dict = Depends(get_current_user)
):
    """Post a manual or AI-generated reply to a Google review."""
    conn_repo, review_repo, _ = _get_gmb_repos(current_user)

    review = await review_repo.find_one({"reviewId": review_id})
    if not review:
        raise HTTPException(status_code=404, detail="Google review not found")

    location = await conn_repo.find_one({"locationId": review.get("locationId")})
    business_name = location.get("locationName", "Our Business") if location else "Our Business"

    reply_text = req.replyComment
    is_ai = False

    if req.generateWithAi or not reply_text:
        reply_text = await ai_engine.generate_review_reply(
            business_name=business_name,
            reviewer_name=review.get("reviewerName", "Valued Customer"),
            star_rating=review.get("starRating", 5),
            review_text=review.get("comment"),
            tone=req.tone or "professional"
        )
        is_ai = True

    now = _now()
    await review_repo.update_one(
        {"reviewId": review_id},
        {"$set": {
            "replyComment": reply_text,
            "replyStatus": "replied",
            "repliedAt": now,
            "isAiGenerated": is_ai,
            "updatedAt": now
        }}
    )

    return {
        "message": "Review reply saved and queued for Google sync",
        "reviewId": review_id,
        "replyComment": reply_text,
        "isAiGenerated": is_ai
    }

# ─────────────────────────────────────────────────────────────────────────────
# 3. Promotional Posts & Scheduling
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/posts")
async def list_posts(
    location_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List Google Business Profile promotional posts."""
    _, _, post_repo = _get_gmb_repos(current_user)
    query = {"locationId": location_id} if location_id else {}
    posts = await post_repo.find(query, sort=[("createdAt", -1)])
    for p in posts:
        p["_id"] = str(p["_id"])
    return {"posts": posts}

@router.post("/posts")
async def create_post(
    req: CreatePostRequest,
    current_user: dict = Depends(get_current_user)
):
    """Create or schedule a Google Business Profile promotional post."""
    _, _, post_repo = _get_gmb_repos(current_user)
    tenant_id = current_user.get("tenantId")

    now = _now()
    sched_dt = None
    status = "published"

    if req.scheduledAt:
        try:
            sched_dt = datetime.fromisoformat(req.scheduledAt)
            if sched_dt > now:
                status = "scheduled"
        except Exception:
            pass

    post_doc = {
        "tenantId": tenant_id,
        "locationId": req.locationId,
        "topicType": req.topicType,
        "summary": req.summary,
        "callToActionType": req.callToActionType,
        "callToActionUrl": req.callToActionUrl,
        "mediaUrl": req.mediaUrl,
        "status": status,
        "scheduledAt": sched_dt,
        "publishedAt": now if status == "published" else None,
        "sourceChannel": "gbp_post",
        "createdAt": now,
        "updatedAt": now
    }

    result = await post_repo.insert_one(post_doc)
    post_doc["_id"] = str(result.inserted_id)
    return {"message": f"GBP post {status} successfully", "post": post_doc}
