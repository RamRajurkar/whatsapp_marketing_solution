import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def enable_gbp():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["whatsapp_saas_live"]
    
    t_res = await db.tenants.update_many(
        {},
        {"$addToSet": {"enabledChannels": "gbp"}}
    )
    s_res = await db.tenant_subscriptions.update_many(
        {},
        {"$addToSet": {"enabledChannels": "gbp"}}
    )
    print(f"Tenants updated: {t_res.modified_count}, Subscriptions updated: {s_res.modified_count}")
    
    async for t in db.tenants.find({}):
        print("Tenant:", t.get("name"), "| ID:", str(t.get("_id")), "| Channels:", t.get("enabledChannels"))
    client.close()

if __name__ == "__main__":
    asyncio.run(enable_gbp())
