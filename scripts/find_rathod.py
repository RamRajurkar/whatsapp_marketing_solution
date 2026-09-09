import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def find_rathod():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    dbs = await client.list_database_names()
    print("Databases in MongoDB:", dbs)
    
    for db_name in dbs:
        db = client[db_name]
        colls = await db.list_collection_names()
        if "users" in colls:
            users = await db.users.find({}).to_list(100)
            for u in users:
                business = u.get("restaurantName") or u.get("businessName") or ""
                email = u.get("email") or ""
                name = u.get("name") or ""
                if "rathod" in (business + email + name).lower():
                    print(f"[FOUND IN DB: {db_name}] Email: {email} | Business: {business} | Name: {name} | ID: {u.get('_id')}")
        
        if "tenants" in colls:
            tenants = await db.tenants.find({}).to_list(100)
            for t in tenants:
                tname = t.get("name") or ""
                if "rathod" in tname.lower():
                    print(f"[FOUND TENANT IN DB: {db_name}] Tenant: {tname} | ID: {t.get('_id')}")

    client.close()

if __name__ == "__main__":
    asyncio.run(find_rathod())
