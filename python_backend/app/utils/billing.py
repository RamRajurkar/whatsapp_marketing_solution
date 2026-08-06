from datetime import datetime, timezone
from typing import Optional
from pymongo.errors import DuplicateKeyError

from app.database import db

# Meta WhatsApp Cloud API Category Rates (Approx USD card as of mid-2026)
RATE_CARD = {
    "marketing": 0.082,
    "utility": 0.035,
    "authentication": 0.028,
    "service": 0.015,  # customer window replies
    "free": 0.00
}

async def log_billing_event(
    tenant_id: Optional[str],
    meta_msg_id: str,
    category: str,
    recipient: str,
    is_free: bool = False
) -> bool:
    """
    Log a billable outbound message event exactly once.
    Deduplicates based on the unique meta_msg_id index to prevent double billing.
    """
    if not meta_msg_id or meta_msg_id == "unknown":
        return False
        
    now = datetime.now(timezone.utc)
    cat_clean = category.lower().strip()
    
    rate = RATE_CARD.get(cat_clean, 0.015)
    if is_free:
        rate = 0.00
        cat_clean = "free"
        
    doc = {
        "metaMessageId": meta_msg_id,
        "recipient": recipient,
        "category": cat_clean,
        "rate": rate,
        "createdAt": now
    }
    
    if tenant_id:
        doc["tenantId"] = tenant_id
        
    try:
        await db.db.billing_events.insert_one(doc)
        return True
    except DuplicateKeyError:
        # Ignore duplicates to enforce idempotency
        print(f"[Billing] Duplicate event ignored for message: {meta_msg_id}")
        return False
    except Exception as e:
        print(f"[Billing] Error logging event: {e}")
        return False

async def get_monthly_usage_rollup(tenant_id: Optional[str], year_month: str) -> dict:
    """
    Aggregate the billing_events collection for a client and month.
    Format of year_month: 'YYYY-MM'
    """
    try:
        start_date = datetime.strptime(f"{year_month}-01", "%Y-%m-%d")
        # Estimate end date
        if start_date.month == 12:
            end_date = datetime(start_date.year + 1, 1, 1)
        else:
            end_date = datetime(start_date.year, start_date.month + 1, 1)
    except Exception:
        start_date = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0)
        end_date = datetime.utcnow()

    match_stage = {
        "createdAt": {
            "$gte": start_date,
            "$lt": end_date
        }
    }
    
    if tenant_id:
        match_stage["tenantId"] = tenant_id
        
    pipeline = [
        {"$match": match_stage},
        {
            "$group": {
                "_id": "$category",
                "totalCount": {"$sum": 1},
                "totalCost": {"$sum": "$rate"}
            }
        }
    ]
    
    cursor = db.db.billing_events.aggregate(pipeline)
    breakdown = {}
    grand_total_cost = 0.0
    grand_total_count = 0
    
    async for item in cursor:
        cat = item["_id"]
        count = item["totalCount"]
        cost = round(item["totalCost"], 4)
        breakdown[cat] = {
            "count": count,
            "cost": cost
        }
        grand_total_cost += cost
        grand_total_count += count
        
    return {
        "billingPeriod": year_month,
        "totalCount": grand_total_count,
        "totalCost": round(grand_total_cost, 4),
        "breakdown": breakdown
    }
