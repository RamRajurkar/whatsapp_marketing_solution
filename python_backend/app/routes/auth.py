from fastapi import APIRouter, HTTPException, Depends, Request
from datetime import datetime, timezone, timedelta
import secrets
from app.models.user import UserLogin, UserCreate, Token, UserInDB
from app.models.tenant import TenantCreate, TeamInviteCreate
from app.utils.auth import verify_password, get_password_hash, create_access_token, verify_token
from app.database import db
from app.config import settings
from fastapi.security import OAuth2PasswordBearer
from app.limiter import limiter
from bson import ObjectId

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

def _now():
    return datetime.now(timezone.utc)

async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """
    Decode the JWT token and return the current user document.
    Enforces strict 401 rejection on legacy tokens lacking tenantId in SaaS mode.
    """
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    is_saas = getattr(settings, "APP_MODE", "self_hosted") == "saas"
    tenant_id = payload.get("tenantId")

    # Strict Legacy JWT rejection policy in SaaS mode (superadmin is exempt as platform operator)
    if is_saas and not tenant_id and payload.get("role") != "superadmin":
        raise HTTPException(
            status_code=401,
            detail="Legacy authentication token missing tenant context. Re-login required."
        )

    user_id = payload.get("id") or payload.get("sub")
    user = await db.db.users.find_one({"_id": user_id})
    if not user:
        try:
            user = await db.db.users.find_one({"_id": ObjectId(user_id)})
        except Exception:
            pass

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    user["_id"] = str(user["_id"])
    if user.get("tenantId"):
        user["tenantId"] = str(user["tenantId"])
    elif tenant_id:
        user["tenantId"] = str(tenant_id)

    return user

@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
async def login(request: Request, user_data: UserLogin):
    """Authenticate user and return tenant-aware JWT token + user info."""
    user = await db.db.users.find_one({"email": user_data.email})

    if not user or not verify_password(user_data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_id_str = str(user["_id"])
    tenant_id_str = str(user.get("tenantId", "")) if user.get("tenantId") else None
    role = user.get("role", "tenant_owner")
    agency_id = str(user.get("agencyId", "")) if user.get("agencyId") else None

    # Fallback in self_hosted if tenantId isn't on user doc
    if not tenant_id_str and getattr(settings, "APP_MODE", "self_hosted") != "saas":
        tenant_id_str = "self_hosted_default"

    token_payload = {
        "id": user_id_str,
        "sub": user_id_str,
        "tenantId": tenant_id_str,
        "role": role,
        "agencyId": agency_id
    }
    access_token = create_access_token(data=token_payload)

    now = _now()
    await db.db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"lastLogin": now, "updatedAt": now}}
    )

    user_resp = {
        "_id": user_id_str,
        "email": user["email"],
        "name": user.get("name", user.get("restaurantName", "User")),
        "restaurantName": user.get("restaurantName", "My Business"),
        "tenantId": tenant_id_str,
        "role": role,
        "agencyId": agency_id,
        "createdAt": user.get("createdAt", now),
        "updatedAt": user.get("updatedAt", now)
    }

    return {"token": access_token, "user": user_resp}

@router.get("/registration-status")
async def registration_status():
    """Check if registration is open."""
    if getattr(settings, "APP_MODE", "self_hosted") == "saas":
        return {"registered": False, "allowNewTenants": True}
    count = await db.db.users.count_documents({})
    return {"registered": count > 0, "allowNewTenants": count == 0}

@router.post("/register", response_model=Token)
@limiter.limit("5/minute")
async def register(request: Request, user_data: UserCreate):
    """Register a new user / tenant account."""
    is_saas = getattr(settings, "APP_MODE", "self_hosted") == "saas"

    if not is_saas:
        existing_count = await db.db.users.count_documents({})
        if existing_count > 0:
            raise HTTPException(status_code=400, detail="Registration is disabled. A user is already registered.")

    existing = await db.db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    now = _now()
    tenant_name = user_data.tenantName or user_data.restaurantName or "My Business"
    tenant_slug = tenant_name.lower().replace(" ", "-").replace("'", "")[:40]

    # Create tenant record in SaaS mode
    tenant_id_str = None
    if is_saas:
        enabled_ch = user_data.enabledChannels or ["whatsapp", "gbp"]
        tenant_doc = {
            "name": tenant_name,
            "slug": tenant_slug,
            "status": "active",
            "enabledChannels": enabled_ch,
            "plan": "starter",
            "createdAt": now,
            "updatedAt": now
        }
        t_res = await db.db.tenants.insert_one(tenant_doc)
        tenant_id_str = str(t_res.inserted_id)

        # Create starter subscription
        sub_doc = {
            "tenantId": tenant_id_str,
            "plan": "starter",
            "status": "active",
            "enabledChannels": enabled_ch,
            "dailyTierCap": 1000,
            "maxMpsLimit": 25,
            "monthlyMessageQuota": 10000,
            "currentPeriodStart": now,
            "createdAt": now,
            "updatedAt": now
        }
        await db.db.tenant_subscriptions.insert_one(sub_doc)

    user_doc = {
        "email": user_data.email,
        "password": get_password_hash(user_data.password),
        "name": user_data.name or tenant_name,
        "restaurantName": tenant_name,
        "tenantId": tenant_id_str,
        "role": "tenant_owner",
        "status": "active",
        "createdAt": now,
        "updatedAt": now,
    }

    result = await db.db.users.insert_one(user_doc)
    user_id_str = str(result.inserted_id)

    token_payload = {
        "id": user_id_str,
        "sub": user_id_str,
        "tenantId": tenant_id_str or "self_hosted_default",
        "role": "tenant_owner"
    }
    access_token = create_access_token(data=token_payload)

    user_resp = {
        "_id": user_id_str,
        "email": user_data.email,
        "name": user_doc["name"],
        "restaurantName": tenant_name,
        "tenantId": tenant_id_str,
        "role": "tenant_owner",
        "createdAt": now,
        "updatedAt": now,
    }

    return {"token": access_token, "user": user_resp}

@router.post("/team/invite")
async def invite_team_member(data: TeamInviteCreate, current_user: dict = Depends(get_current_user)):
    """Invite a new team member to the calling user's tenant."""
    tenant_id = current_user.get("tenantId")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Cannot invite members without an active tenant")

    if current_user.get("role") not in ("tenant_owner", "superadmin", "agency_admin"):
        raise HTTPException(status_code=403, detail="Only tenant owners can invite team members")

    # Check if user already exists
    existing_user = await db.db.users.find_one({"email": data.email})
    if existing_user:
        raise HTTPException(status_code=409, detail="A user with this email already exists")

    now = _now()
    invite_token = secrets.token_urlsafe(32)
    invite_doc = {
        "tenantId": tenant_id,
        "email": data.email,
        "role": data.role or "tenant_member",
        "inviteToken": invite_token,
        "expiresAt": now + timedelta(days=7),
        "status": "pending",
        "createdAt": now
    }
    await db.db.team_invites.insert_one(invite_doc)

    return {
        "success": True,
        "message": f"Invitation created for {data.email}",
        "inviteToken": invite_token,
        "inviteLink": f"/login?invite={invite_token}"
    }

@router.get("/team/members")
async def list_team_members(current_user: dict = Depends(get_current_user)):
    """List all team members for the calling tenant."""
    tenant_id = current_user.get("tenantId")
    query = {"tenantId": tenant_id} if tenant_id else {}
    cursor = db.db.users.find(query, {"password": 0})
    members = []
    async for u in cursor:
        u["_id"] = str(u["_id"])
        members.append(u)
    return {"members": members}

@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Return the currently authenticated user's profile and active channels."""
    tenant_id = current_user.get("tenantId")
    enabled_channels = ["whatsapp"]
    if tenant_id and getattr(settings, "APP_MODE", "self_hosted") == "saas":
        tenant = None
        try:
            tenant = await db.db.tenants.find_one({"_id": ObjectId(tenant_id)})
        except Exception:
            pass
        if not tenant:
            tenant = await db.db.tenants.find_one({"_id": str(tenant_id)})
        if tenant:
            enabled_channels = tenant.get("enabledChannels", ["whatsapp"])

    return {
        "_id": str(current_user["_id"]),
        "email": current_user["email"],
        "name": current_user.get("name", current_user.get("restaurantName", "User")),
        "restaurantName": current_user.get("restaurantName", "My Business"),
        "tenantId": tenant_id,
        "role": current_user.get("role", "tenant_owner"),
        "agencyId": current_user.get("agencyId"),
        "enabledChannels": enabled_channels,
        "createdAt": current_user.get("createdAt"),
        "updatedAt": current_user.get("updatedAt")
    }
