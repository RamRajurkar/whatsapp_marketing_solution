"""
Google Business Profile (GBP / GMB) Channel Data Models.
All credentials stored with field-level encryption via CryptoVault.
"""

from typing import Optional, List
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from app.utils.crypto_vault import crypto_vault

def _now():
    return datetime.now(timezone.utc)

class GBPConnection(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    tenantId: str
    accountName: Optional[str] = None
    locationId: str
    locationName: str  # Display name of the Google Business location
    address: Optional[str] = None
    placeId: Optional[str] = None
    
    # Encrypted OAuth tokens
    accessTokenEncrypted: str
    refreshTokenEncrypted: Optional[str] = None
    tokenExpiresAt: Optional[datetime] = None
    
    # Automation settings
    reviewAutoReplyEnabled: bool = False
    reviewReplyTone: str = "professional"  # professional, friendly, concise, enthusiastic
    minStarRatingForAutoReply: int = 4     # auto-reply to >= 4 stars automatically, flag <= 3 stars
    
    status: str = "connected"  # connected, expired, disconnected
    createdAt: datetime = Field(default_factory=_now)
    updatedAt: datetime = Field(default_factory=_now)

    class Config:
        populate_by_name = True

    @classmethod
    def create_encrypted(
        cls,
        tenant_id: str,
        location_id: str,
        location_name: str,
        access_token: str,
        refresh_token: Optional[str] = None,
        account_name: Optional[str] = None,
        address: Optional[str] = None,
        place_id: Optional[str] = None,
        token_expires_at: Optional[datetime] = None,
        review_auto_reply_enabled: bool = False,
    ) -> "GBPConnection":
        return cls(
            tenantId=tenant_id,
            locationId=location_id,
            locationName=location_name,
            accountName=account_name,
            address=address,
            placeId=place_id,
            accessTokenEncrypted=crypto_vault.encrypt_secret(access_token),
            refreshTokenEncrypted=crypto_vault.encrypt_secret(refresh_token) if refresh_token else None,
            tokenExpiresAt=token_expires_at,
            reviewAutoReplyEnabled=review_auto_reply_enabled,
        )

    def get_decrypted_access_token(self) -> str:
        return crypto_vault.decrypt_secret(self.accessTokenEncrypted)

    def get_decrypted_refresh_token(self) -> Optional[str]:
        return crypto_vault.decrypt_secret(self.refreshTokenEncrypted) if self.refreshTokenEncrypted else None


class GBPReview(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    tenantId: str
    locationId: str
    reviewId: str
    reviewerName: str
    reviewerPhotoUrl: Optional[str] = None
    starRating: int  # 1 to 5
    comment: Optional[str] = None
    
    # Review reply data
    replyComment: Optional[str] = None
    replyStatus: str = "pending"  # pending, replied, manual_review, failed
    repliedAt: Optional[datetime] = None
    isAiGenerated: bool = False
    
    sourceChannel: str = "gbp_review"
    createdAt: datetime = Field(default_factory=_now)
    updatedAt: datetime = Field(default_factory=_now)

    class Config:
        populate_by_name = True


class GBPPost(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    tenantId: str
    locationId: str
    topicType: str = "STANDARD"  # STANDARD, EVENT, OFFER
    summary: str                 # Post body text
    callToActionType: Optional[str] = "LEARN_MORE"  # BOOK, ORDER, SHOP, LEARN_MORE, SIGN_UP, CALL
    callToActionUrl: Optional[str] = None
    mediaUrl: Optional[str] = None
    
    status: str = "draft"  # draft, scheduled, published, failed
    scheduledAt: Optional[datetime] = None
    publishedAt: Optional[datetime] = None
    googlePostId: Optional[str] = None
    errorMessage: Optional[str] = None
    
    sourceChannel: str = "gbp_post"
    createdAt: datetime = Field(default_factory=_now)
    updatedAt: datetime = Field(default_factory=_now)

    class Config:
        populate_by_name = True
