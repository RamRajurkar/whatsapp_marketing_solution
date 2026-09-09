import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient

# Setup env
os.environ["APP_MODE"] = "saas"
os.environ["DB_NAME"] = "whatsapp_saas_live"
os.environ["MONGODB_URI"] = "mongodb://localhost:27017"

from app.database import connect_to_mongo
from app.routes.webhook import _run_bot_logic

async def test():
    await connect_to_mongo()
    tenant_id = "6a99cfa6a24ee495a4360c7d"
    phone_number = "918625067058"
    conv_id = "6a99d79ed1ac67d586d1cf0b"
    msg = {
        "from": phone_number,
        "id": "wamid.test_reply_123",
        "text": {"body": "Hello Staging Test"},
        "type": "text"
    }
    
    print("Testing _run_bot_logic...")
    res = await _run_bot_logic(
        msg=msg,
        msg_type="text",
        text_content="Hello Staging Test",
        phone_number=phone_number,
        conv_id=conv_id,
        tenant_id=tenant_id
    )
    print("Bot Reply Result:", res)

if __name__ == "__main__":
    asyncio.run(test())
