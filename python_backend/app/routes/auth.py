from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from app.models.user import UserLogin, UserCreate, Token, UserInDB
from app.utils.auth import verify_password, get_password_hash, create_access_token, verify_token
from app.database import db
from pydantic import BaseModel
from fastapi.security import OAuth2PasswordBearer

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    """Decode the JWT token and return the current user document."""
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    user = await db.db.users.find_one({"_id": payload.get("id")})
    if not user:
        # Also try string match for ObjectId-stored users
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
async def login(user_data: UserLogin):
    """Authenticate user and return JWT token + user info."""
    user = await db.db.users.find_one({"email": user_data.email})
    
    if not user or not verify_password(user_data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Generate token
    user_id_str = str(user["_id"])
    access_token = create_access_token(data={"id": user_id_str})

    # Update last login timestamp
    await db.db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"lastLogin": datetime.utcnow(), "updatedAt": datetime.utcnow()}}
    )

    # Prepare user response
    user_resp = {
        "_id": user_id_str,
        "email": user["email"],
        "restaurantName": user.get("restaurantName", "My Restaurant"),
        "createdAt": user.get("createdAt", datetime.utcnow()),
        "updatedAt": user.get("updatedAt", datetime.utcnow())
    }

    return {"token": access_token, "user": user_resp}

@router.post("/register", response_model=Token)
async def register(user_data: UserCreate):
    """Register a new user account."""
    # Check if email already exists
    existing = await db.db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    # Create user document
    now = datetime.utcnow()
    user_doc = {
        "email": user_data.email,
        "password": get_password_hash(user_data.password),
        "restaurantName": user_data.restaurantName,
        "createdAt": now,
        "updatedAt": now,
    }

    result = await db.db.users.insert_one(user_doc)
    user_id_str = str(result.inserted_id)

    # Generate token
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
        "createdAt": current_user.get("createdAt", datetime.utcnow()),
        "updatedAt": current_user.get("updatedAt", datetime.utcnow())
    }
