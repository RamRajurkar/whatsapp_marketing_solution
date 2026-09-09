import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient

async def check():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['whatsapp_saas_live']
    tenant_id = "6a99cfa6a24ee495a4360c7d"
    
    conv = await db.conversations.find_one({"tenantId": tenant_id})
    print("=" * 70)
    print("CONVERSATION RECORD IN DATABASE:")
    print("=" * 70)
    if conv:
        print(f"  Conversation ID : {conv.get('_id')}")
        print(f"  Customer Phone  : {conv.get('customerPhone')}")
        print(f"  Customer Name   : {conv.get('customerName')}")
        print(f"  Tenant ID       : {conv.get('tenantId')}")
        print(f"  Last Message    : {conv.get('lastMessage')}")
        print(f"  Last Msg Time   : {conv.get('lastMessageTime')}")
        print(f"  Unread Count    : {conv.get('unreadCount')}")
        print(f"  Status          : {conv.get('status')}")
    else:
        print("No conversation found.")
        
    print("\n" + "=" * 70)
    print("MESSAGES LEDGER IN DATABASE:")
    print("=" * 70)
    msgs = await db.messages.find({"tenantId": tenant_id}).sort("createdAt", 1).to_list(20)
    for m in msgs:
        dir_flag = "INBOUND " if m.get("direction") == "inbound" else "OUTBOUND"
        msg_id = m.get("whatsappMessageId", "N/A")
        text = m.get("content", {}).get("text", "")
        print(f"  [{dir_flag}] [{m.get('type')}] ID: {msg_id}")
        print(f"     Content : {text[:80]}")
        print(f"     Created : {m.get('createdAt')}")
        print()
    print("=" * 70)
    client.close()

if __name__ == "__main__":
    asyncio.run(check())
