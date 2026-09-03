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
import os
from app.services.message_poller import catchup_missed_messages
from app.http_client import get_http_client, close_http_client
from app.config import settings

# Ensure uploads directory exists
os.makedirs("uploads/branding", exist_ok=True)
os.makedirs("uploads/menu", exist_ok=True)


async def create_indexes(db):
    # conversations — queried by phone number on every message
    await db.db.conversations.create_index("phone_number")
    await db.db.conversations.create_index("user_id")

    # messages — queried by conversation_id sorted by created_at
    await db.db.messages.create_index([("conversation_id", 1), ("created_at", -1)])

    # customers — queried by phone on every message
    await db.db.customers.create_index("phone")
    await db.db.customers.create_index("user_id")

    # bot_settings — queried by user_id on every message
    await db.db.bot_settings.create_index("user_id")

    # broadcasts — queried by status and scheduled_at
    await db.db.broadcasts.create_index([("status", 1), ("scheduled_at", 1)])

    print("[STARTUP] MongoDB indexes created")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    get_http_client()  # Initialize the persistent HTTP client
    await connect_to_mongo()

    # Create MongoDB indexes for query performance
    try:
        await db.db.customers.create_index("tags")
        await db.db.messages.create_index("broadcastId")
        await db.db.messages.create_index("conversationId")
        await db.db.conversations.create_index([("lastMessageTime", -1)])
        await db.db.reservation_states.create_index("updatedAt", expireAfterSeconds=600)
        
        # Enforce unique index for outbound billing deduplication
        await db.db.billing_events.create_index("metaMessageId", unique=True)
        
        # Mode-based customer and conversation unique constraints
        if settings.APP_MODE == "saas":
            await db.db.customers.create_index([("tenantId", 1), ("phone", 1)], unique=True)
            await db.db.conversations.create_index([("tenantId", 1), ("customerPhone", 1)], unique=True)
            print("[STARTUP] SaaS Mode compound unique indexes created.")
        else:
            try:
                await db.db.customers.create_index("phone", unique=True)
            except Exception:
                pass
            try:
                await db.db.conversations.create_index("customerPhone", unique=True)
            except Exception:
                pass
            print("[STARTUP] Self-Hosted unique indexes created.")
            
        await create_indexes(db)
        print("MongoDB indexes created/verified")
    except Exception as e:
        print(f"Warning: Could not create some indexes: {e}")

    # Seed default flow
    try:
        from app.routes.bot_flow import DEFAULT_FLOW
        flow_count = await db.db.bot_flows.count_documents({})
        if flow_count == 0:
            default_seed = DEFAULT_FLOW.copy()
            default_seed["createdAt"] = datetime.now(timezone.utc)
            default_seed["updatedAt"] = datetime.now(timezone.utc)
            await db.db.bot_flows.insert_one(default_seed)
            print("[STARTUP] Default chatbot flow seeded successfully.")
    except Exception as e:
        print(f"[STARTUP] Error seeding chatbot flow: {e}")

    # ── Missed-message catchup (Supabase queue) ──────────────────────────
    try:
        print("[STARTUP] Running missed-message catchup …")
        await catchup_missed_messages()
        print("[STARTUP] Missed-message catchup complete")
    except Exception as e:
        print(f"[STARTUP] Missed-message catchup error (non-fatal): {e}")

    # Start Inactivity Checker Loop in the background
    import asyncio
    from app.services.inactivity_checker import inactivity_checker_loop
    checker_task = asyncio.create_task(inactivity_checker_loop())

    yield
    # Shutdown
    checker_task.cancel()
    try:
        await checker_task
    except asyncio.CancelledError:
        pass
    await close_http_client()
    await close_mongo_connection()

app = FastAPI(title="RestoChat API", lifespan=lifespan, redirect_slashes=True)

# Attach rate limiter to app state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS ─────────────────────────────────────────────────────────────────────
# Allow localhost origins for local deployment + any Cloudflare tunnel URL.
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

from app.routes import auth, settings as settings_route, customers, segments, webhook, conversations, broadcasts, messaging, reports, media, bot, quick_replies, menu, reservations, faq, feedback, bot_flow

app.include_router(auth.router,          prefix="/api/auth",          tags=["auth"])
app.include_router(settings_route.router, prefix="/api/settings",      tags=["settings"])
app.include_router(customers.router,     prefix="/api/customers",     tags=["customers"])
app.include_router(segments.router,      prefix="/api/segments",      tags=["segments"])
app.include_router(webhook.router,       prefix="/api/webhook",       tags=["webhook"])
app.include_router(conversations.router, prefix="/api/conversations", tags=["conversations"])
app.include_router(broadcasts.router,    prefix="/api/broadcasts",    tags=["broadcasts"])
app.include_router(messaging.router,     prefix="/api/messaging",     tags=["messaging"])
app.include_router(reports.router,       prefix="/api/reports",       tags=["reports"])
app.include_router(media.router,         prefix="/api/media",         tags=["media"])
app.include_router(bot.router,           prefix="/api/bot",           tags=["bot"])
app.include_router(bot_flow.router,      prefix="/api/bot/flow",      tags=["bot_flow"])
app.include_router(quick_replies.router, prefix="/api/quick-replies", tags=["quick-replies"])
app.include_router(menu.router,          prefix="/api/menu",          tags=["menu"])
app.include_router(reservations.router,  prefix="/api/reservations",  tags=["reservations"])
app.include_router(faq.router,           prefix="/api/faq",           tags=["faq"])
app.include_router(feedback.router,      prefix="/api/feedback",      tags=["feedback"])

@app.get("/")
async def root():
    return {"message": "Welcome to RestoChat Python API"}

@app.get("/api/health")
async def health_check():
    """Health check endpoint used by frontend splash screen to detect when backend is ready."""
    try:
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
