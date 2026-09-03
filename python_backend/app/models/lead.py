"""
Unified Channel-Agnostic Lead Model.
Supports multi-channel source attribution: WhatsApp, GBP Review, GBP QR Code, E-Commerce sync, and Manual.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel, Field

def _now():
    return datetime.now(timezone.utc)

class Lead(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    tenantId: str
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    
    # Channel attribution
    sourceChannel: str = "manual"  # "whatsapp", "gbp_review", "gbp_qr", "ecommerce_admin", "manual"
    sourceMetadata: Optional[Dict[str, Any]] = Field(default_factory=dict)
    
    # CRM pipeline
    status: str = "new"  # "new", "contacted", "qualified", "proposal_sent", "converted", "closed_lost"
    tags: List[str] = Field(default_factory=list)
    notes: Optional[str] = ""
    assignedToUserId: Optional[str] = None
    estimatedValue: Optional[float] = 0.0
    
    lastContactedAt: Optional[datetime] = None
    createdAt: datetime = Field(default_factory=_now)
    updatedAt: datetime = Field(default_factory=_now)

    class Config:
        populate_by_name = True
