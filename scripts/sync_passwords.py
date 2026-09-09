import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.utils.auth import get_password_hash

async def sync():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['whatsapp_saas_live']
    pw = get_password_hash('Password123!')
    await db.users.update_many({}, {"$set": {"password": pw}})
    print("Passwords synchronized successfully to: Password123!")
    client.close()

if __name__ == '__main__':
    asyncio.run(sync())
