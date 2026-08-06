import os
from pymongo import MongoClient

uri = os.getenv('MONGODB_URL', 'mongodb://wa_mongodb:27017')
client = MongoClient(uri)
db = client['whatsapp_saas']

for conv in db.conversations.find():
    phone = conv.get('customerPhone')
    name = conv.get('customerName')
    if phone and name and name != phone:
        db.customers.update_one({'phone': phone}, {'$set': {'name': name}})
        print(f"Updated {phone} -> {name}")
