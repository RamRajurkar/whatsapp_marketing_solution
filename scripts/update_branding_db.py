import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def update_branding():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    for db_name in ["whatsapp_saas_live", "test_chat"]:
        db = client[db_name]
        res = await db.branding.update_many(
            {},
            {"$set": {
                "appName": "Black Angler",
                "tagline": "Omnichannel Marketing & WhatsApp Business Platform"
            }}
        )
        print(f"{db_name} updated: {res.modified_count} docs")
        
        # Verify
        doc = await db.branding.find_one({})
        if doc:
            print(f"  {db_name} appName is now: {doc.get('appName')}")
    client.close()

if __name__ == "__main__":
    asyncio.run(update_branding())
