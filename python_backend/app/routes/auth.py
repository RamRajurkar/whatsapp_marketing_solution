from fastapi import APIRouter, HTTPException, Depends, Request
from datetime import datetime, timezone
from app.models.user import UserLogin, UserCreate, Token, UserInDB
from app.utils.auth import verify_password, get_password_hash, create_access_token, verify_token
from app.database import db
from pydantic import BaseModel
from fastapi.security import OAuth2PasswordBearer
from app.limiter import limiter

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    """Decode the JWT token and return the current user document."""
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = await db.db.users.find_one({"_id": payload.get("id")})
    if not user:
        from bson import ObjectId
        try:
            user = await db.db.users.find_one({"_id": ObjectId(payload.get("id"))})
        except Exception:
            pass

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    user["_id"] = str(user["_id"])
    return user

@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
async def login(request: Request, user_data: UserLogin):
    """Authenticate user and return JWT token + user info. Rate limited to 10 attempts/minute."""
    user = await db.db.users.find_one({"email": user_data.email})

    if not user or not verify_password(user_data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_id_str = str(user["_id"])
    access_token = create_access_token(data={"id": user_id_str})

    now = datetime.now(timezone.utc)
    await db.db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"lastLogin": now, "updatedAt": now}}
    )

    user_resp = {
        "_id": user_id_str,
        "email": user["email"],
        "restaurantName": user.get("restaurantName", "My Restaurant"),
        "createdAt": user.get("createdAt", now),
        "updatedAt": user.get("updatedAt", now)
    }

    return {"token": access_token, "user": user_resp}

@router.get("/registration-status")
async def registration_status():
    """Check if any user is already registered in the system."""
    count = await db.db.users.count_documents({})
    return {"registered": count > 0}

@router.post("/register", response_model=Token)
@limiter.limit("5/minute")
async def register(request: Request, user_data: UserCreate):
    """Register a new user account (Only allowed if no user exists). Rate limited."""
    existing_count = await db.db.users.count_documents({})
    if existing_count > 0:
        raise HTTPException(status_code=400, detail="Registration is disabled. A user is already registered.")

    existing = await db.db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    now = datetime.now(timezone.utc)
    user_doc = {
        "email": user_data.email,
        "password": get_password_hash(user_data.password),
        "restaurantName": user_data.restaurantName,
        "createdAt": now,
        "updatedAt": now,
    }

    result = await db.db.users.insert_one(user_doc)
    user_id_str = str(result.inserted_id)
    access_token = create_access_token(data={"id": user_id_str})

    user_resp = {
        "_id": user_id_str,
        "email": user_data.email,
        "restaurantName": user_data.restaurantName,
        "createdAt": now,
        "updatedAt": now,
    }

    return {"token": access_token, "user": user_resp}

@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return {
        "_id": str(current_user["_id"]),
        "email": current_user["email"],
        "restaurantName": current_user.get("restaurantName", "My Restaurant"),
        "createdAt": current_user.get("createdAt"),
        "updatedAt": current_user.get("updatedAt")
    }
