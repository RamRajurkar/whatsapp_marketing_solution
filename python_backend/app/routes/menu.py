import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from app.routes.auth import get_current_user
from app.database import db
from bson import ObjectId
from app.utils.tenant import get_tenant_filter, inject_tenant_id

router = APIRouter()

UPLOAD_DIR = "uploads/menu"
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_MIME_TYPES = {
    "application/pdf": "pdf",
    "image/jpeg": "image",
    "image/jpg": "image",
    "image/png": "image",
    "image/webp": "image",
}

MAX_FILE_SIZE = 16 * 1024 * 1024  # 16 MB


def _now():
    return datetime.now(timezone.utc)


@router.post("/upload")
async def upload_menu_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a menu/catalog file (PDF or image) to local storage."""
    if not file:
        raise HTTPException(status_code=400, detail="No file provided")

    # Validate MIME type
    content_type = file.content_type or ""
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {content_type}. Allowed: PDF, JPEG, PNG, WebP"
        )

    # Read file contents
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds the 16MB limit")

    tenant_filter = get_tenant_filter(current_user)

    # Check limit (max 20 catalog files per tenant)
    menu_count = await db.db.menu_assets.count_documents(tenant_filter)
    if menu_count >= 20:
        raise HTTPException(status_code=400, detail="Catalog library has reached the maximum limit of 20 files.")

    # Save file locally
    file_extension = os.path.splitext(file.filename or "file")[1] or (
        ".pdf" if content_type == "application/pdf" else ".jpg"
    )
    unique_filename = f"{uuid.uuid4().hex}{file_extension}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    with open(file_path, "wb") as f:
        f.write(contents)

    # Determine type
    file_type = ALLOWED_MIME_TYPES.get(content_type, "pdf")

    # Generate the public URL
    relative_url = f"/uploads/menu/{unique_filename}"

    doc = {
        "name": file.filename or unique_filename,
        "uniqueName": unique_filename,
        "mimeType": content_type,
        "type": file_type,  # "pdf" or "image"
        "url": relative_url,
        "size": len(contents),
        "createdAt": _now(),
    }
    inject_tenant_id(doc, current_user)

    result = await db.db.menu_assets.insert_one(doc)
    doc["_id"] = str(result.inserted_id)

    return doc


@router.get("")
@router.get("/")
async def list_menu_assets(current_user: dict = Depends(get_current_user)):
    """Retrieve all uploaded menu files."""
    tenant_filter = get_tenant_filter(current_user)
    cursor = db.db.menu_assets.find(tenant_filter).sort("createdAt", -1)
    assets = []
    async for m in cursor:
        m["_id"] = str(m["_id"])
        assets.append(m)
    return assets


@router.delete("/{asset_id}")
async def delete_menu_asset(asset_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a menu file from DB and disk."""
    tenant_filter = get_tenant_filter(current_user)
    query = {"_id": ObjectId(asset_id)}
    if tenant_filter:
        query = {"$and": [query, tenant_filter]}

    m = await db.db.menu_assets.find_one(query)
    if not m:
        raise HTTPException(status_code=404, detail="Catalog asset not found")

    # Delete from DB
    await db.db.menu_assets.delete_one(query)

    # Delete from disk
    file_path = os.path.join(UPLOAD_DIR, m.get("uniqueName", ""))
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception as e:
            print(f"Error deleting file {file_path}: {e}")

    return {"message": "Catalog asset deleted successfully"}
