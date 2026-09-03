import asyncio
import os
import time
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DB_NAME = "whatsapp_saas_live"

async def run_explain():
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[DB_NAME]
    
    from app.database import ensure_indexes
    await ensure_indexes(db)
    
    test_tenant_id = str(ObjectId())
    test_conv_id = str(ObjectId())
    
    # ── 1. Messages explain() ────────────────────────────────────────────────
    # Seed sample messages
    msg_docs = [
        {
            "tenantId": test_tenant_id,
            "conversationId": test_conv_id,
            "whatsappMessageId": f"wamid_test_{i}",
            "direction": "outbound",
            "content": {"text": f"Message {i}"},
            "createdAt": time.time() + i
        }
        for i in range(50)
    ]
    await db.messages.insert_many(msg_docs)
    
    msg_explain = await db.messages.find(
        {"tenantId": test_tenant_id, "conversationId": test_conv_id}
    ).sort("createdAt", -1).explain()
    
    msg_plan = msg_explain.get("queryPlanner", {}).get("winningPlan", {})
    msg_input_stage = msg_plan.get("inputStage", {})
    msg_stage = msg_plan.get("stage") or msg_input_stage.get("stage", "UNKNOWN")
    msg_index_name = msg_input_stage.get("indexName") or msg_plan.get("indexName", "NONE")
    
    print("=" * 75)
    print("MESSAGES QUERY EXPLAIN() VERIFICATION")
    print("=" * 75)
    print(f"Query: db.messages.find({{'tenantId': '{test_tenant_id}', 'conversationId': '{test_conv_id}'}}).sort('createdAt', -1)")
    print(f"  - Winning Plan Primary Stage: {msg_stage}")
    print(f"  - Input Stage (Seek Type): {msg_input_stage.get('stage')}")
    print(f"  - Index Name Used: {msg_index_name}")
    print(f"  - Leading Prefix Verified: {msg_index_name.startswith('tenantId_1')}")
    print(f"  - Key Pattern: {msg_input_stage.get('keyPattern')}")
    print(f"  - Index Bounds: {msg_input_stage.get('indexBounds')}")
    
    # ── 2. Broadcasts explain() ──────────────────────────────────────────────
    # Seed sample broadcasts
    bc_docs = [
        {
            "tenantId": test_tenant_id,
            "name": f"Broadcast {i}",
            "status": "pending" if i % 2 == 0 else "sent",
            "createdAt": time.time() + i
        }
        for i in range(50)
    ]
    await db.broadcasts.insert_many(bc_docs)
    
    bc_explain = await db.broadcasts.find(
        {"tenantId": test_tenant_id, "status": "pending"}
    ).sort("createdAt", -1).explain()
    
    bc_plan = bc_explain.get("queryPlanner", {}).get("winningPlan", {})
    bc_input_stage = bc_plan.get("inputStage", {})
    bc_stage = bc_plan.get("stage") or bc_input_stage.get("stage", "UNKNOWN")
    bc_index_name = bc_input_stage.get("indexName") or bc_plan.get("indexName", "NONE")
    
    print("\n" + "=" * 75)
    print("BROADCASTS QUERY EXPLAIN() VERIFICATION")
    print("=" * 75)
    print(f"Query: db.broadcasts.find({{'tenantId': '{test_tenant_id}', 'status': 'pending'}}).sort('createdAt', -1)")
    print(f"  - Winning Plan Primary Stage: {bc_stage}")
    print(f"  - Input Stage (Seek Type): {bc_input_stage.get('stage')}")
    print(f"  - Index Name Used: {bc_index_name}")
    print(f"  - Leading Prefix Verified: {bc_index_name.startswith('tenantId_1')}")
    print(f"  - Key Pattern: {bc_input_stage.get('keyPattern')}")
    print(f"  - Index Bounds: {bc_input_stage.get('indexBounds')}")
    print("=" * 75)

    # Clean up seed data
    await db.messages.delete_many({"tenantId": test_tenant_id})
    await db.broadcasts.delete_many({"tenantId": test_tenant_id})
    client.close()

if __name__ == "__main__":
    asyncio.run(run_explain())
