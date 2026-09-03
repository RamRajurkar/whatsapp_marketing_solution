"""
WhatsApp Channel Connection Model (Multi-Tenant & Encrypted).
Stores Meta Cloud API credentials per tenant with field-level encryption.
"""

from typing import Optional, List
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from app.utils.crypto_vault import crypto_vault

def _now():
    return datetime.now(timezone.utc)

class WhatsAppConnection(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    tenantId: str
    phoneNumberId: str
    wabaId: str  # WhatsApp Business Account ID
    displayPhoneNumber: Optional[str] = None
    qualityRating: Optional[str] = "GREEN"  # GREEN, YELLOW, RED, UNKNOWN
    
    # Encrypted secret credentials (stored with 'enc::' prefix)
    accessTokenEncrypted: str
    appSecretEncrypted: Optional[str] = None
    verifyTokenEncrypted: Optional[str] = None
    
    apiVersion: str = "v21.0"
    status: str = "connected"  # connected, disconnected, expired, rate_limited
    webhookVerified: bool = True
    rateLimitTier: int = 80  # messages per second limit from Meta tier
    
    createdAt: datetime = Field(default_factory=_now)
    updatedAt: datetime = Field(default_factory=_now)

    class Config:
        populate_by_name = True

    @classmethod
    def create_encrypted(
        cls,
        tenant_id: str,
        phone_number_id: str,
        waba_id: str,
        access_token: str,
        app_secret: Optional[str] = None,
        verify_token: Optional[str] = None,
        display_phone_number: Optional[str] = None,
        rate_limit_tier: int = 80,
    ) -> "WhatsAppConnection":
        return cls(
            tenantId=tenant_id,
            phoneNumberId=phone_number_id,
            wabaId=waba_id,
            displayPhoneNumber=display_phone_number,
            accessTokenEncrypted=crypto_vault.encrypt_secret(access_token),
            appSecretEncrypted=crypto_vault.encrypt_secret(app_secret) if app_secret else None,
            verifyTokenEncrypted=crypto_vault.encrypt_secret(verify_token) if verify_token else None,
            rateLimitTier=rate_limit_tier,
        )

    def get_decrypted_access_token(self) -> str:
        return crypto_vault.decrypt_secret(self.accessTokenEncrypted)

    def get_decrypted_app_secret(self) -> Optional[str]:
        return crypto_vault.decrypt_secret(self.appSecretEncrypted) if self.appSecretEncrypted else None

    def get_decrypted_verify_token(self) -> Optional[str]:
        return crypto_vault.decrypt_secret(self.verifyTokenEncrypted) if self.verifyTokenEncrypted else None
