from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio
import uvicorn
from contextlib import asynccontextmanager
from app.database import connect_to_mongo, close_mongo_connection, db
from app.utils.auth import get_password_hash
from app.routes import auth, settings, customers, webhook, conversations, broadcasts, messaging
from datetime import datetime

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await connect_to_mongo()
    yield
    # Shutdown
    await close_mongo_connection()

app = FastAPI(title="RestoChat API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.socket import sio

socket_app = socketio.ASGIApp(sio, app)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(customers.router, prefix="/api/customers", tags=["customers"])
app.include_router(webhook.router, prefix="/api/webhook", tags=["webhook"])
app.include_router(conversations.router, prefix="/api/conversations", tags=["conversations"])
app.include_router(broadcasts.router, prefix="/api/broadcasts", tags=["broadcasts"])
app.include_router(messaging.router, prefix="/api/messaging", tags=["messaging"])

@app.get("/")
async def root():
    return {"message": "Welcome to RestoChat Python API"}

if __name__ == "__main__":
    uvicorn.run("app.main:socket_app", host="0.0.0.0", port=5000, reload=True)
