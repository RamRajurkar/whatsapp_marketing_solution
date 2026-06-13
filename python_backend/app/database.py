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
