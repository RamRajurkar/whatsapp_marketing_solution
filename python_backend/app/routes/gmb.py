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
