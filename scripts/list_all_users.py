import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def list_all_db_users():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    dbs = await client.list_database_names()
    
    for db_name in dbs:
        if db_name in ['admin', 'config', 'local']:
            continue
        db = client[db_name]
        colls = await db.list_collection_names()
        for c in ["users", "user", "admin", "admins"]:
            if c in colls:
                users = await db[c].find({}).to_list(10)
                print(f"\n--- DB: {db_name} | Coll: {c} ({len(users)} docs) ---")
                for u in users:
                    keys = {k: str(v) for k, v in u.items() if k != 'password'}
                    print(" ", keys)
    client.close()

if __name__ == '__main__':
    asyncio.run(list_all_db_users())
