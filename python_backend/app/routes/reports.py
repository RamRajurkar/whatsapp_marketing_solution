from fastapi import APIRouter, Depends
from datetime import datetime, timedelta, timezone
from app.routes.auth import get_current_user
from app.database import db

router = APIRouter()

def _now():
    return datetime.now(timezone.utc)

@router.get("/dashboard")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    # Total customers
    total_customers = await db.db.customers.count_documents({})
    
    # New customers today
    today_start = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    new_customers_today = await db.db.customers.count_documents({"createdAt": {"$gte": today_start}})
    
    # Active conversations
    active_conversations = await db.db.conversations.count_documents({"status": "active"})
    
    # Recent conversations
    cursor = db.db.conversations.find().sort("lastMessageAt", -1).limit(5)
    recent_conversations = await cursor.to_list(length=5)
    for c in recent_conversations:
        c["_id"] = str(c["_id"])
        
    return {
        "totalCustomers": total_customers,
        "newCustomersToday": new_customers_today,
        "activeConversations": active_conversations,
        "reservationsToday": 0,  # Placeholder as reservations are not implemented
        "recentConversations": recent_conversations
    }

@router.get("/analytics")
async def get_analytics(days: int = 7, current_user: dict = Depends(get_current_user)):
    start_date = _now() - timedelta(days=days)
    
    # Aggregate messages by day — use createdAt if available, fall back to timestamp
    messages_pipeline = [
        {"$addFields": {"_dateField": {"$ifNull": ["$createdAt", "$timestamp"]}}},
        {"$match": {"_dateField": {"$gte": start_date}}},
        {"$group": {
            "_id": {
                "$dateToString": {
                    "format": "%Y-%m-%d",
                    "date": "$_dateField"
                }
            },
            "count": {"$sum": 1},
            "inbound": {
                "$sum": {"$cond": [{"$eq": ["$direction", "inbound"]}, 1, 0]}
            },
            "outbound": {
                "$sum": {"$cond": [{"$eq": ["$direction", "outbound"]}, 1, 0]}
            }
        }},
        {"$sort": {"_id": 1}}
    ]
    daily_messages = await db.db.messages.aggregate(messages_pipeline).to_list(length=None)
    
    total_messages = sum(d["count"] for d in daily_messages)
    
    broadcast_stats = await db.db.broadcasts.aggregate([
        {"$group": {
            "_id": None,
            "total_campaigns": {"$sum": 1},
            "total_targets": {"$sum": "$stats.total"},
            "total_sent": {"$sum": "$stats.sent"},
            "total_failed": {"$sum": "$stats.failed"}
        }}
    ]).to_list(length=1)
    
    bc_stats = broadcast_stats[0] if broadcast_stats else {"total_campaigns": 0, "total_targets": 0, "total_sent": 0, "total_failed": 0}

    return {
        "totals": {
            "messages": total_messages,
            "reservations": 0,
            "broadcasts": {
                "total": bc_stats.get("total_targets", 0),
                "sent": bc_stats.get("total_sent", 0),
                "failed": bc_stats.get("total_failed", 0),
                "campaigns": bc_stats.get("total_campaigns", 0)
            }
        },
        "dailyMessages": daily_messages
    }
