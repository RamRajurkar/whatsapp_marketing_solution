import os
from pymongo import MongoClient

uri = os.getenv('MONGODB_URL', 'mongodb://wa_mongodb:27017')
client = MongoClient(uri)
db = client['whatsapp_saas']

# 1. Update broadcast_recipients where status is 'sent' but messages has 'delivered' or 'read'
recs = list(db.broadcast_recipients.find({'status': 'sent'}))
print(f"Found {len(recs)} recipients with status 'sent'")

for r in recs:
    wa_id = r.get('whatsappMessageId')
    phone = r.get('customerPhone')
    msg = None
    if wa_id:
        msg = db.messages.find_one({'whatsappMessageId': wa_id})
    if not msg and phone:
        msg = db.messages.find_one({'customerPhone': phone, 'direction': 'outbound', 'status': {'$in': ['delivered', 'read']}})
    
    if msg and msg.get('status') in ['delivered', 'read']:
        print(f"Updating recipient {r.get('customerPhone')} from {r.get('status')} to {msg.get('status')}")
        db.broadcast_recipients.update_one({'_id': r['_id']}, {'$set': {'status': msg.get('status')}})

print("DB Sync Fix Completed Successfully")
