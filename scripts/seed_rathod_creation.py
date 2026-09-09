import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from app.utils.auth import get_password_hash
from datetime import datetime, timezone

async def setup_rathod_creation():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["whatsapp_saas_live"]
    now = datetime.now(timezone.utc).isoformat()
    
    # 1. Tenant: Rathod Creation
    existing_tenant = await db.tenants.find_one({"name": "Rathod Creation"})
    if existing_tenant:
        tenant_id = str(existing_tenant["_id"])
        await db.tenants.update_one(
            {"_id": existing_tenant["_id"]},
            {"$set": {
                "enabledChannels": ["whatsapp", "gbp"],
                "status": "active",
                "plan": "growth",
                "updatedAt": now
            }}
        )
        print(f"Updated existing Rathod Creation tenant: {tenant_id}")
    else:
        t_doc = {
            "name": "Rathod Creation",
            "slug": "rathod-creation",
            "status": "active",
            "enabledChannels": ["whatsapp", "gbp"],
            "plan": "growth",
            "phone": "918625067058",
            "createdAt": now,
            "updatedAt": now
        }
        res = await db.tenants.insert_one(t_doc)
        tenant_id = str(res.inserted_id)
        print(f"Created Rathod Creation tenant: {tenant_id}")
    
    # 2. Subscription
    await db.tenant_subscriptions.update_one(
        {"tenantId": tenant_id},
        {"$set": {
            "plan": "growth",
            "status": "active",
            "enabledChannels": ["whatsapp", "gbp"],
            "dailyTierCap": 10000,
            "maxMpsLimit": 50,
            "monthlyMessageQuota": 50000,
            "updatedAt": now
        }},
        upsert=True
    )
    
    # 3. User Accounts for Rathod Creation
    accounts = [
        {"email": "admin@rathodcreation.com", "name": "Rathod Creation Admin"},
        {"email": "ramrajurkar2020@gmail.com", "name": "Ram Rajurkar (Rathod Creation)"},
        {"email": "rathod@blackangler.com", "name": "Rathod Creation"}
    ]
    
    pw_hash = get_password_hash("Password123!")
    
    for acc in accounts:
        user_doc = {
            "email": acc["email"],
            "password": pw_hash,
            "name": acc["name"],
            "restaurantName": "Rathod Creation",
            "businessName": "Rathod Creation",
            "tenantId": tenant_id,
            "role": "tenant_owner",
            "status": "active",
            "updatedAt": now
        }
        await db.users.update_one(
            {"email": acc["email"]},
            {"$set": user_doc, "$setOnInsert": {"createdAt": now}},
            upsert=True
        )
        print(f"Configured Rathod Creation user: {acc['email']} (Password: Password123!)")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(setup_rathod_creation())
