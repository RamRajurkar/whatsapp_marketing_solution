from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings


class DataBase:
    client: AsyncIOMotorClient = None
    db = None

db = DataBase()

async def ensure_indexes(database=None):
    """
    Build leading tenantId compound indexes for all tenant-scoped collections.
    Ensures O(log N) B-Tree seek operations and prevents collection scans.
    """
    target_db = database if database is not None else db.db
    if target_db is None:
        return

    is_saas = getattr(settings, "APP_MODE", "self_hosted") == "saas"

    try:
        if is_saas:
            # Customers
            await target_db.customers.create_index([("tenantId", 1), ("phone", 1)], unique=True)
            await target_db.customers.create_index([("tenantId", 1), ("tags", 1)])
            await target_db.customers.create_index([("tenantId", 1), ("createdAt", -1)])

            # Conversations
            await target_db.conversations.create_index([("tenantId", 1), ("customerPhone", 1)], unique=True)
            await target_db.conversations.create_index([("tenantId", 1), ("phone_number", 1)])
            await target_db.conversations.create_index([("tenantId", 1), ("lastMessageTime", -1)])

            # Messages
            await target_db.messages.create_index([("tenantId", 1), ("conversationId", 1), ("createdAt", -1)])
            await target_db.messages.create_index([("tenantId", 1), ("broadcastId", 1)])

            # Broadcasts
            await target_db.broadcasts.create_index([("tenantId", 1), ("status", 1), ("createdAt", -1)])

            # Reviews, Leads, Replies
            await target_db.gbp_reviews.create_index([("tenantId", 1), ("starRating", 1)])
            await target_db.gbp_reviews.create_index([("tenantId", 1), ("createdAt", -1)])
            await target_db.leads.create_index([("tenantId", 1), ("status", 1)])
            await target_db.leads.create_index([("tenantId", 1), ("createdAt", -1)])
            await target_db.quick_replies.create_index([("tenantId", 1), ("category", 1)])

            # Billing
            await target_db.billing_events.create_index([("tenantId", 1), ("createdAt", -1)])
            print("[DATABASE] SaaS Mode leading tenantId compound indexes successfully built.")
        else:
            try:
                await target_db.customers.create_index("phone", unique=True)
            except Exception:
                pass
            try:
                await target_db.conversations.create_index("customerPhone", unique=True)
            except Exception:
                pass
            print("[DATABASE] Self-Hosted unique indexes built.")

        # Common deduplication & TTL indexes
        await target_db.billing_events.create_index("metaMessageId", unique=True)
        await target_db.reservation_states.create_index("updatedAt", expireAfterSeconds=600)
    except Exception as e:
        print(f"[DATABASE] Index creation notice: {e}")

async def connect_to_mongo():
    try:
        db.client = AsyncIOMotorClient(settings.MONGODB_URI, tz_aware=True)
        db.db = db.client[settings.DB_NAME]
        print(f"Connected to MongoDB: {settings.DB_NAME}")
        await ensure_indexes(db.db)
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
    client = AsyncIOMotorClient(settings.MONGODB_URI, tz_aware=True)
    database = client[settings.DB_NAME]
    return client, database
