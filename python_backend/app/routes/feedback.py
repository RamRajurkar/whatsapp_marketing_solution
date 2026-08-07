from fastapi import APIRouter, Depends
from app.routes.auth import get_current_user
from app.database import db

router = APIRouter()

@router.get("/stats")
async def get_feedback_stats(current_user: dict = Depends(get_current_user)):
    """Get feedback average rating and count."""
    pipeline = [
        {
            "$group": {
                "_id": None,
                "averageRating": {"$avg": "$rating"},
                "totalCount": {"$sum": 1}
            }
        }
    ]
    cursor = db.db.feedback.aggregate(pipeline)
    stats = {"averageRating": 0, "totalCount": 0}
    async for doc in cursor:
        stats["averageRating"] = round(doc.get("averageRating", 0), 1)
        stats["totalCount"] = doc.get("totalCount", 0)
        
    return {"data": stats}

@router.get("")
@router.get("/")
async def get_all_feedback(current_user: dict = Depends(get_current_user)):
    """Get all feedback items."""
    feedback_list = []
    cursor = db.db.feedback.find().sort("createdAt", -1)
    async for f in cursor:
        f["_id"] = str(f["_id"])
        if "reservationId" in f:
            f["reservationId"] = str(f["reservationId"])
        feedback_list.append(f)
    return {"data": feedback_list}
