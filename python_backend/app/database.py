from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings


class DataBase:
    client: AsyncIOMotorClient = None
    db = None

db = DataBase()

async def connect_to_mongo():
    try:
        db.client = AsyncIOMotorClient(settings.MONGODB_URI)
        db.db = db.client[settings.DB_NAME]
        print(f"Connected to MongoDB: {settings.DB_NAME}")
    except Exception as e:
        print(f"Could not connect to MongoDB: {e}")

async def close_mongo_connection():
    if db.client:
        db.client.close()
        print("MongoDB connection closed")


def get_worker_db():
    """
    Create a standalone Motor client for use inside Celery workers.

    Celery workers run in separate processes, so they cannot share
    the FastAPI server's Motor client. This function creates a fresh
    connection each time it's called. The caller is responsible for
    closing the client when done.

    Returns:
        tuple: (client, database) — both Motor async objects.
    """
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    database = client[settings.DB_NAME]
    return client, database
