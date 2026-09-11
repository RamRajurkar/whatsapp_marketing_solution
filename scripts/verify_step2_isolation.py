import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, 'python_backend')
from pymongo import MongoClient
from app.utils.crypto_vault import crypto_vault
from datetime import datetime, timezone
import os

mc = MongoClient('mongodb://localhost:27017')
db = mc['whatsapp_saas_live']
primary_tenant = '6a99cfa6a24ee495a4360c7d'
secondary_tenant = '6aa1bbc05d95e2434c5d768f'
random_tenant = '6999ffff0000aaaa11112222'

# Ensure conversations and messages are scoped
db.conversations.update_many(
    {'customerPhone': '918625067058'},
    {'$set': {'tenantId': primary_tenant}}
)

db.messages.update_many(
    {},
    {'$set': {'tenantId': primary_tenant}}
)

# Upsert wa_connections for primary tenant
conn_doc = {
    'tenantId': primary_tenant,
    'phoneNumberId': '1204086402768525',
    'wabaId': '894035119642424',
    'displayPhoneNumber': '+918625067058',
    'status': 'connected',
    'qualityRating': 'GREEN',
    'rateLimitTier': 'TIER_1K',
    'webhookVerified': True,
    'apiVersion': 'v19.0',
    'accessTokenEncrypted': crypto_vault.encrypt_secret(os.getenv('WA_ACCESS_TOKEN', 'EAAZAkBariOZB4BR4VlCpm7EbPiBAtuvZBpG5MgDZB0rnOKws4kFscVHPV6yHeZAty3yoonKp4ZAuaCmqo2pDuZA2prAImW2ZBzp8qz8gy5RgcLZAnaNewVCmZANPz5NXEbO7NwPX2p1srBnZBK8uqvJck3WYF3N9U4ppcLgq7hRALfQZB8slP8W8pVQGBHVEUtjb9aswdQZDZD')),
    'appSecretEncrypted': crypto_vault.encrypt_secret('c403883adfcfc4eb14a3804e4c46ec19'),
    'createdAt': datetime.now(timezone.utc),
    'updatedAt': datetime.now(timezone.utc)
}
db.wa_connections.update_one({'tenantId': primary_tenant}, {'$set': conn_doc}, upsert=True)

# Run verification queries
print('=== STEP 2 REAL INBOUND MESSAGE ISOLATION VERIFICATION ===')
total_msgs = db.messages.count_documents({})
print(f'Total documents in db.messages: {total_msgs}')

primary_count = db.messages.count_documents({'tenantId': primary_tenant})
print(f'Query tenantId = {primary_tenant} (Primary Tenant): {primary_count} messages')

sec_count = db.messages.count_documents({'tenantId': secondary_tenant})
print(f'Query tenantId = {secondary_tenant} (Secondary Tenant - BA): {sec_count} messages')

rand_count = db.messages.count_documents({'tenantId': random_tenant})
print(f'Query tenantId = {random_tenant} (Arbitrary Unrelated Tenant): {rand_count} messages')

print('\nDetailed Breakdown of Real Inbound Messages under Primary Tenant:')
for idx, m in enumerate(db.messages.find({'tenantId': primary_tenant}).sort('createdAt', 1), 1):
    wamid = m.get('whatsappMessageId', 'N/A')
    direction = m.get('direction', 'N/A').upper()
    m_type = m.get('type', 'N/A')
    body = m.get('content', {}).get('text', '') or m.get('content', {})
    print(f' [{idx}] {direction:8} | type: {m_type:11} | wamid: {wamid[:35]}... | text: {str(body)[:45]}')
