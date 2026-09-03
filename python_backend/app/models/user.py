from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Any
from datetime import datetime, timezone

def _now():
    return datetime.now(timezone.utc)

class UserBase(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    restaurantName: Optional[str] = "My Business"
    tenantId: Optional[str] = None
    agencyId: Optional[str] = None
    role: str = "tenant_owner"  # superadmin, agency_admin, tenant_owner, tenant_member
    status: str = "active"

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None
    restaurantName: Optional[str] = "My Business"
    tenantName: Optional[str] = None
    role: Optional[str] = "tenant_owner"
    enabledChannels: Optional[list[str]] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserInDB(UserBase):
    id: str = Field(alias="_id")
    createdAt: datetime = Field(default_factory=_now)
    updatedAt: datetime = Field(default_factory=_now)

class Token(BaseModel):
    token: str
    user: Any
