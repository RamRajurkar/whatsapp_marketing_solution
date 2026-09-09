import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import re

async def deep_search():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    dbs = await client.list_database_names()
    
    for db_name in dbs:
        if db_name in ['admin', 'config', 'local']:
            continue
        db = client[db_name]
        colls = await db.list_collection_names()
        for coll_name in colls:
            coll = db[coll_name]
            count = await coll.count_documents({})
            if count == 0:
                continue
            
            # Check for users or any document mentioning rathod
            cursor = coll.find({"$or": [
                {"email": {"$regex": "rathod", "$options": "i"}},
                {"name": {"$regex": "rathod", "$options": "i"}},
                {"restaurantName": {"$regex": "rathod", "$options": "i"}},
                {"businessName": {"$regex": "rathod", "$options": "i"}},
                {"tenantName": {"$regex": "rathod", "$options": "i"}},
            ]})
            matches = await cursor.to_list(10)
            if matches:
                print(f"\n[FOUND in DB '{db_name}', Collection '{coll_name}'] ({len(matches)} match(es)):")
                for m in matches:
                    print({k: v for k, v in m.items() if k in ['_id', 'email', 'name', 'restaurantName', 'businessName', 'role', 'phone']})

    client.close()

if __name__ == '__main__':
    asyncio.run(deep_search())
