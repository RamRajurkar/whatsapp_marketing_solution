import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import json

async def check():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['whatsapp_saas_live']
    doc = await db.wa_connections.find_one({'tenantId': '6a99cfa6a24ee495a4360c7d'})
    if doc:
        print("Raw MongoDB Document in `wa_connections`:")
        print("=" * 70)
        print(f"  _id: {doc.get('_id')}")
        print(f"  tenantId: {doc.get('tenantId')}")
        print(f"  phoneNumberId: {doc.get('phoneNumberId')}")
        print(f"  wabaId: {doc.get('wabaId')}")
        print(f"  displayPhoneNumber: {doc.get('displayPhoneNumber')}")
        print(f"  status: {doc.get('status')}")
        print(f"  qualityRating: {doc.get('qualityRating')}")
        print(f"  rateLimitTier: {doc.get('rateLimitTier')}")
        print(f"  webhookVerified: {doc.get('webhookVerified')}")
        print(f"  apiVersion: {doc.get('apiVersion')}")
        print(f"  createdAt: {doc.get('createdAt')}")
        print(f"  updatedAt: {doc.get('updatedAt')}")
        print("\nEncrypted Secrets Proof (AES-256-GCM Vault):")
        for k in ['accessTokenEncrypted', 'appSecretEncrypted', 'verifyTokenEncrypted']:
            val = doc.get(k)
            if val:
                print(f"  {k}:")
                print(f"    - Starts with 'enc::': {val.startswith('enc::')}")
                print(f"    - Value prefix: {val[:20]}...")
                print(f"    - Total ciphertext length: {len(val)} chars")
            else:
                print(f"  {k}: None")
        print("=" * 70)
    else:
        print("Document not found in wa_connections")
    client.close()

if __name__ == "__main__":
    asyncio.run(check())
