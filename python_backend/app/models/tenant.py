"""
Channel-agnostic Multi-Tenant, Agency, Subscription and Billing Models.
"""

from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone

def _now():
    return datetime.now(timezone.utc)

class TenantBase(BaseModel):
    name: str
    slug: Optional[str] = None
    agencyId: Optional[str] = None
    status: str = "active"  # active, suspended, trialing
    enabledChannels: List[str] = Field(default_factory=lambda: ["whatsapp"])  # e.g. ["whatsapp", "gbp"]
    plan: str = "starter"   # starter, growth, enterprise, custom
    settings: Dict[str, Any] = Field(default_factory=dict)

class TenantCreate(TenantBase):
    pass

class TenantInDB(TenantBase):
    id: Optional[str] = Field(None, alias="_id")
    createdAt: datetime = Field(default_factory=_now)
    updatedAt: datetime = Field(default_factory=_now)

class AgencyBase(BaseModel):
    name: str
    slug: Optional[str] = None
    contactEmail: EmailStr
    contactPhone: Optional[str] = None
    revenueModel: str = "revenue_share"  # "wholesale" or "revenue_share"
    rateOrPercentage: float = 20.0       # e.g., 20% rev share, or fixed per-tenant rate
    status: str = "active"               # active, suspended

class AgencyCreate(AgencyBase):
    pass

class AgencyInDB(AgencyBase):
    id: Optional[str] = Field(None, alias="_id")
    createdAt: datetime = Field(default_factory=_now)
    updatedAt: datetime = Field(default_factory=_now)

class AgencyBillingLedgerEntry(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    agencyId: str
    tenantId: Optional[str] = None
    clientTenantId: Optional[str] = None
    entryType: str = "wholesale_charge"  # wholesale_charge, revenue_share_commission, payout, adjustment
    amount: float = 0.0
    description: Optional[str] = ""
    billingCycle: Optional[str] = None   # e.g. "2026-09"
    grossAmount: float = 0.0
    platformShare: float = 0.0
    agencyShare: float = 0.0
    status: str = "settled"              # pending, settled, paid, disputed
    paymentReference: Optional[str] = None
    settledAt: Optional[datetime] = None
    createdAt: datetime = Field(default_factory=_now)

class TenantSubscription(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    tenantId: str
    plan: str = "starter"
    status: str = "active"               # trialing, active, past_due, cancelled
    pricePerMonth: float = 0.0
    enabledChannels: List[str] = Field(default_factory=lambda: ["whatsapp"])
    dailyTierCap: int = 1000
    maxMpsLimit: int = 25
    monthlyMessageQuota: int = 10000
    paymentReference: Optional[str] = None
    currentPeriodStart: datetime = Field(default_factory=_now)
    currentPeriodEnd: Optional[datetime] = None
    createdAt: datetime = Field(default_factory=_now)
    updatedAt: datetime = Field(default_factory=_now)

class TeamInviteCreate(BaseModel):
    email: EmailStr
    role: str = "tenant_member"          # tenant_owner, tenant_member

class TeamInviteInDB(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    tenantId: str
    email: EmailStr
    role: str = "tenant_member"
    token: str
    status: str = "pending"              # pending, accepted, expired
    expiresAt: datetime
    createdAt: datetime = Field(default_factory=_now)

# Model aliases for convenience
Tenant = TenantInDB
Agency = AgencyInDB
AgencyBillingLedger = AgencyBillingLedgerEntry
