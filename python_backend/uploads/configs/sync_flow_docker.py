import asyncio
import json
import os
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

CONFIG_FILE = "/app/uploads/configs/active_chatbot_flow.json"
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://mongodb:27017")
DB_NAME = os.getenv("DB_NAME", "test_chat")

async def sync():
    if not os.path.exists(CONFIG_FILE):
        print(f"Error: {CONFIG_FILE} not found!")
        return

    print(f"Reading flow from {CONFIG_FILE}...")
    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
        flow_data = json.load(f)

    print(f"Connecting to MongoDB at {MONGODB_URI} (DB: {DB_NAME})...")
    client = AsyncIOMotorClient(MONGODB_URI, tz_aware=True)
    db = client[DB_NAME]

    now = datetime.now(timezone.utc)
    flow_data["updatedAt"] = now

    # Check if a flow already exists
    existing = await db.bot_flows.find_one({})
    if existing:
        print("Existing chatbot flow found. Updating flow configuration...")
        await db.bot_flows.update_one(
            {"_id": existing["_id"]},
            {"$set": flow_data}
        )
    else:
        print("No chatbot flow found in database. Inserting new flow...")
        flow_data["createdAt"] = now
        await db.bot_flows.insert_one(flow_data)

    print("Success! Chatbot flow synced to MongoDB inside the container.")
    client.close()

if __name__ == "__main__":
    asyncio.run(sync())
