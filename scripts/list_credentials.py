import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.utils.auth import get_password_hash

async def check():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['whatsapp_saas_live']
    
    # Check default superadmin account
    admin = await db.users.find_one({"email": "admin@blackangler.com"})
    if not admin:
        # Create standard platform superadmin account
        await db.users.insert_one({
            "email": "admin@blackangler.com",
            "password": get_password_hash("Password123!"),
            "name": "Super Admin",
            "role": "superadmin",
            "status": "active"
        })
        print("Created default superadmin: admin@blackangler.com")
    else:
        # Reset password to Password123! to be certain
        await db.users.update_one({"email": "admin@blackangler.com"}, {"$set": {"password": get_password_hash("Password123!")}})
        print("Updated superadmin: admin@blackangler.com")

    # Check tenant alpha account
    alpha = await db.users.find_one({"email": "admin_alpha_live_ui@test.com"})
    if alpha:
        await db.users.update_one({"email": "admin_alpha_live_ui@test.com"}, {"$set": {"password": get_password_hash("Password123!")}})
        print("Updated tenant alpha: admin_alpha_live_ui@test.com")

    # List accounts
    users = await db.users.find({}).to_list(20)
    for u in users:
        print(f"User: {u.get('email')} | Role: {u.get('role')} | Name: {u.get('name')}")
    client.close()

if __name__ == '__main__':
    asyncio.run(check())
