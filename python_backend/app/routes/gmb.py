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
