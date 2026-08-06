import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from app.routes.auth import get_current_user
from app.database import db
from bson import ObjectId
from app.utils.tenant import get_tenant_filter, inject_tenant_id

router = APIRouter()

UPLOAD_DIR = "uploads/media"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def _now():
    return datetime.now(timezone.utc)

@router.post("/upload")
@router.post("/upload/")
async def upload_local_media(
    file: UploadFile = File(None),
    current_user: dict = Depends(get_current_user),
):
    """Upload a file to local server storage and save metadata to DB."""
    if not file:
        raise HTTPException(status_code=400, detail="No file provided")

    tenant_filter = get_tenant_filter(current_user)
    
    # Check 100 image limit per tenant
    media_count = await db.db.media.count_documents(tenant_filter)
    if media_count >= 100:
        raise HTTPException(status_code=400, detail="Media library has reached the maximum limit of 100 files.")

    file_extension = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4().hex}{file_extension}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    # Save file locally
    contents = await file.read()
    if len(contents) > 20 * 1024 * 1024: # 20 MB limit
        raise HTTPException(status_code=400, detail="File size exceeds the 20MB limit")
        
    with open(file_path, "wb") as f:
        f.write(contents)

    # Generate the public URL
    relative_url = f"/uploads/media/{unique_filename}"

    media_doc = {
        "filename": file.filename,
        "uniqueName": unique_filename,
        "mimeType": file.content_type,
        "url": relative_url,
        "size": len(contents),
        "createdAt": _now()
    }
    inject_tenant_id(media_doc, current_user)

    result = await db.db.media.insert_one(media_doc)
    media_doc["_id"] = str(result.inserted_id)

    return {"message": "Upload successful", "url": relative_url, "media": media_doc}

@router.get("")
@router.get("/")
async def get_all_media(current_user: dict = Depends(get_current_user)):
    """Retrieve all uploaded media."""
    tenant_filter = get_tenant_filter(current_user)
    cursor = db.db.media.find(tenant_filter).sort("createdAt", -1)
    media_list = []
    async for m in cursor:
        m["_id"] = str(m["_id"])
        media_list.append(m)
    return {"media": media_list}

@router.delete("/{media_id}")
async def delete_media(media_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a media file from DB and disk."""
    tenant_filter = get_tenant_filter(current_user)
    query = {"_id": ObjectId(media_id)}
    if tenant_filter:
        query = {"$and": [query, tenant_filter]}

    m = await db.db.media.find_one(query)
    if not m:
        raise HTTPException(status_code=404, detail="Media not found")

    # Delete from DB
    await db.db.media.delete_one(query)

    # Delete from disk
    file_path = os.path.join(UPLOAD_DIR, m.get("uniqueName", ""))
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception as e:
            print(f"Error deleting file {file_path}: {e}")

    return {"message": "Media deleted successfully"}
