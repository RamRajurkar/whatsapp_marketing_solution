import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def inspect_dbs():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    for db_name in ['restaurant', 'restaurantDB', 'whatsapp_service', 'nirmalyam']:
        db = client[db_name]
        colls = await db.list_collection_names()
        print(f"\nDB: {db_name} -> Collections: {colls}")
        for c in colls:
            count = await db[c].count_documents({})
            sample = await db[c].find_one()
            print(f"  {c} ({count} docs) sample keys: {list(sample.keys()) if sample else None}")
    client.close()

if __name__ == '__main__':
    asyncio.run(inspect_dbs())
