from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.limiter import limiter
import socketio
import uvicorn
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from app.database import connect_to_mongo, close_mongo_connection, db
from app.utils.auth import get_password_hash
from app.routes import auth, settings, customers, webhook, conversations, broadcasts, messaging
import os

# Ensure uploads directory exists
os.makedirs("uploads/branding", exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await connect_to_mongo()
    yield
    # Shutdown
    await close_mongo_connection()

app = FastAPI(title="RestoChat API", lifespan=lifespan)

# Attach rate limiter to app state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS ─────────────────────────────────────────────────────────────────────
# Allow localhost origins for local deployment + any Cloudflare tunnel URL.
# In production set ALLOWED_ORIGINS in .env to your real domain.
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:80",
    "http://localhost",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

from app.socket import sio

socket_app = socketio.ASGIApp(sio, app)

app.include_router(auth.router,          prefix="/api/auth",          tags=["auth"])
app.include_router(settings.router,      prefix="/api/settings",      tags=["settings"])
app.include_router(customers.router,     prefix="/api/customers",     tags=["customers"])
app.include_router(webhook.router,       prefix="/api/webhook",       tags=["webhook"])
app.include_router(conversations.router, prefix="/api/conversations", tags=["conversations"])
app.include_router(broadcasts.router,    prefix="/api/broadcasts",    tags=["broadcasts"])
app.include_router(messaging.router,     prefix="/api/messaging",     tags=["messaging"])

@app.get("/")
async def root():
    return {"message": "Welcome to RestoChat Python API"}

@app.get("/api/health")
async def health_check():
    """Health check endpoint used by frontend splash screen to detect when backend is ready."""
    try:
        # Ping MongoDB to confirm DB is actually up
        await db.client.admin.command("ping")
        db_status = "ok"
    except Exception:
        db_status = "unavailable"
    return {
        "status": "ok",
        "db": db_status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

if __name__ == "__main__":
    uvicorn.run("app.main:socket_app", host="0.0.0.0", port=5000, reload=True)
