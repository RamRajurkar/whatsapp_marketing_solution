import io
import csv
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from typing import Optional, List
from pydantic import BaseModel
from app.routes.auth import get_current_user
from app.database import db
from app.utils.phone import normalize_indian_phone
from bson import ObjectId
from datetime import datetime, timezone
from app.utils.tenant import get_tenant_filter, inject_tenant_id

def _now():
    return datetime.now(timezone.utc)

router = APIRouter()

class CreateSegmentFromCRM(BaseModel):
    name: str
    description: Optional[str] = ""
    tags: Optional[List[str]] = []
    customerIds: Optional[List[str]] = []
    filterTags: Optional[List[str]] = []
    searchQuery: Optional[str] = ""

@router.get("")
@router.get("/")
async def get_segments(current_user: dict = Depends(get_current_user)):
    tenant_filter = get_tenant_filter(current_user)
    query = tenant_filter if tenant_filter else {}
    
    cursor = db.db.customer_segments.find(query).sort("createdAt", -1)
    segments = await cursor.to_list(length=200)
    
    for s in segments:
        s["_id"] = str(s["_id"])
        # Format total count if array or numeric count stored
        if "members" in s and isinstance(s["members"], list):
            s["totalCount"] = len(s["members"])
        else:
            s["totalCount"] = s.get("totalCount", 0)
            
    return {"segments": segments}

@router.get("/{segment_id}")
async def get_segment_by_id(
    segment_id: str,
    search: str = Query(""),
    limit: int = Query(100),
    page: int = Query(1),
    current_user: dict = Depends(get_current_user)
):
    try:
        obj_id = ObjectId(segment_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid segment ID format")
        
    tenant_filter = get_tenant_filter(current_user)
    query = {"_id": obj_id}
    if tenant_filter:
        query = {"$and": [query, tenant_filter]}
        
    segment = await db.db.customer_segments.find_one(query)
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
        
    segment["_id"] = str(segment["_id"])
    members = segment.get("members", [])
    
    # Filter members if search query provided
    if search:
        q = search.lower()
        members = [
            m for m in members
            if q in (m.get("name") or "").lower() or q in (m.get("phone") or "").lower()
        ]
        
    total_members = len(members)
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    paginated_members = members[start_idx:end_idx]
    
    segment["members"] = paginated_members
    segment["totalMembers"] = total_members
    return segment

@router.post("/from-csv")
async def create_segment_from_csv(
    name: str = Form(...),
    description: str = Form(""),
    sync_to_crm: bool = Form(True),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    if not name or not name.strip():
        raise HTTPException(status_code=400, detail="Segment name is required")
        
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are supported")
        
    contents = await file.read()
    try:
        decoded = contents.decode("utf-8-sig")
    except UnicodeDecodeError:
        decoded = contents.decode("latin-1")
        
    csv_reader = csv.DictReader(io.StringIO(decoded))
    headers = [h.strip() for h in (csv_reader.fieldnames or [])]
    
    # Identify phone column
    phone_col = None
    for candidate in ["phone", "mobile", "whatsapp", "phone_number", "contact", "number", "wa_number"]:
        for h in headers:
            if candidate in h.lower():
                phone_col = h
                break
        if phone_col:
            break
            
    if not phone_col and headers:
        phone_col = headers[0] # Default to first column if not auto-detected
        
    name_col = None
    for candidate in ["name", "customer_name", "full_name", "first_name"]:
        for h in headers:
            if candidate in h.lower():
                name_col = h
                break
        if name_col:
            break

    tags_col = None
    for candidate in ["tag", "tags", "category", "label"]:
        for h in headers:
            if candidate in h.lower():
                tags_col = h
                break
        if tags_col:
            break

    members = []
    seen_phones = set()
    crm_upsert_operations = []
    now = _now()
    
    for row in csv_reader:
        raw_phone = str(row.get(phone_col, "")).strip() if phone_col else ""
        if not raw_phone:
            # Try searching all columns for a phone-like digit string
            for k, val in row.items():
                v_str = str(val or "").strip()
                digits = re.sub(r'\D', '', v_str)
                if len(digits) >= 10:
                    raw_phone = v_str
                    break
        if not raw_phone:
            continue
            
        try:
            norm_phone = normalize_indian_phone(raw_phone)
        except Exception:
            digits = re.sub(r'\D', '', raw_phone)
            if len(digits) == 10:
                norm_phone = f"91{digits}"
            elif len(digits) >= 10:
                norm_phone = digits
            else:
                continue
            
        if norm_phone in seen_phones:
            continue
        seen_phones.add(norm_phone)
        
        raw_name = str(row.get(name_col, "")).strip() if name_col else ""
        if not raw_name:
            raw_name = f"Customer {norm_phone[-4:]}"
            
        raw_tags = str(row.get(tags_col, "")).strip() if tags_col else ""
        tag_list = [t.strip() for t in raw_tags.split(",") if t.strip()] if raw_tags else ["CSV Segment"]
        
        member_doc = {
            "name": raw_name,
            "phone": norm_phone,
            "tags": tag_list,
            "addedAt": now.isoformat()
        }
        members.append(member_doc)
        
        if sync_to_crm:
            crm_upsert_operations.append({
                "phone": norm_phone,
                "name": raw_name,
                "tags": tag_list
            })

    if not members:
        raise HTTPException(status_code=400, detail="No valid phone numbers found in CSV file")

    # Save segment document
    segment_doc = {
        "name": name.strip(),
        "description": description.strip(),
        "source": "csv_upload",
        "fileName": file.filename,
        "totalCount": len(members),
        "tags": ["CSV Import"],
        "members": members,
        "createdAt": now,
        "updatedAt": now,
    }
    inject_tenant_id(segment_doc, current_user)
    
    result = await db.db.customer_segments.insert_one(segment_doc)
    segment_doc["_id"] = str(result.inserted_id)

    # Sync to CRM if requested
    synced_crm_count = 0
    if sync_to_crm and crm_upsert_operations:
        tenant_filter = get_tenant_filter(current_user)
        for op in crm_upsert_operations:
            exists_query = {"phone": op["phone"]}
            if tenant_filter:
                exists_query = {"$and": [exists_query, tenant_filter]}
            existing = await db.db.customers.find_one(exists_query)
            if not existing:
                cust_doc = {
                    "name": op["name"],
                    "phone": op["phone"],
                    "waId": op["phone"],
                    "tags": op["tags"],
                    "notes": f"Created via Segment CSV: {name}",
                    "createdAt": now,
                    "updatedAt": now,
                    "lastSeen": None
                }
                inject_tenant_id(cust_doc, current_user)
                await db.db.customers.insert_one(cust_doc)
                synced_crm_count += 1
            else:
                # Merge tags if existing
                new_tags = list(set(existing.get("tags", []) + op["tags"]))
                await db.db.customers.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {"tags": new_tags, "updatedAt": now}}
                )

    return {
        "message": f"Segment '{name}' created with {len(members)} contacts!",
        "segmentId": segment_doc["_id"],
        "totalCount": len(members),
        "syncedCrmCount": synced_crm_count
    }

@router.post("/from-crm")
async def create_segment_from_crm(req: CreateSegmentFromCRM, current_user: dict = Depends(get_current_user)):
    if not req.name or not req.name.strip():
        raise HTTPException(status_code=400, detail="Segment name is required")
        
    tenant_filter = get_tenant_filter(current_user)
    
    # Build query for CRM customers
    query = {}
    if req.customerIds:
        try:
            obj_ids = [ObjectId(cid) for cid in req.customerIds]
            query["_id"] = {"$in": obj_ids}
        except:
            raise HTTPException(status_code=400, detail="Invalid customer IDs format")
    elif req.filterTags or req.searchQuery:
        conditions = []
        if req.filterTags:
            conditions.append({"tags": {"$in": req.filterTags}})
        if req.searchQuery:
            sq = req.searchQuery.strip()
            conditions.append({
                "$or": [
                    {"name": {"$regex": sq, "$options": "i"}},
                    {"phone": {"$regex": sq, "$options": "i"}}
                ]
            })
        if len(conditions) == 1:
            query = conditions[0]
        elif len(conditions) > 1:
            query = {"$and": conditions}
            
    if tenant_filter:
        if query:
            query = {"$and": [query, tenant_filter]}
        else:
            query = tenant_filter
            
    cursor = db.db.customers.find(query)
    customers = await cursor.to_list(length=100000)
    
    if not customers:
        raise HTTPException(status_code=400, detail="No customers matched the specified selection/filters")
        
    members = []
    now = _now()
    all_tags = set(req.tags or [])
    
    for c in customers:
        members.append({
            "customerId": str(c["_id"]),
            "name": c.get("name", "Customer"),
            "phone": c.get("phone", ""),
            "tags": c.get("tags", []),
            "addedAt": now.isoformat()
        })
        for t in c.get("tags", []):
            all_tags.add(t)

    segment_doc = {
        "name": req.name.strip(),
        "description": req.description.strip(),
        "source": "crm_filter",
        "filterTags": req.filterTags,
        "totalCount": len(members),
        "tags": list(all_tags),
        "members": members,
        "createdAt": now,
        "updatedAt": now,
    }
    inject_tenant_id(segment_doc, current_user)
    
    result = await db.db.customer_segments.insert_one(segment_doc)
    segment_doc["_id"] = str(result.inserted_id)

    return {
        "message": f"Segment '{req.name}' created with {len(members)} contacts!",
        "segmentId": segment_doc["_id"],
        "totalCount": len(members)
    }

@router.delete("/{segment_id}")
async def delete_segment(segment_id: str, current_user: dict = Depends(get_current_user)):
    try:
        obj_id = ObjectId(segment_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid segment ID format")
        
    tenant_filter = get_tenant_filter(current_user)
    delete_query = {"_id": obj_id}
    if tenant_filter:
        delete_query = {"$and": [delete_query, tenant_filter]}
        
    res = await db.db.customer_segments.delete_one(delete_query)
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Segment not found")
        
    return {"message": "Segment deleted successfully"}

@router.get("/{segment_id}/export")
async def export_segment_csv(segment_id: str, current_user: dict = Depends(get_current_user)):
    try:
        obj_id = ObjectId(segment_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid segment ID format")
        
    tenant_filter = get_tenant_filter(current_user)
    query = {"_id": obj_id}
    if tenant_filter:
        query = {"$and": [query, tenant_filter]}
        
    segment = await db.db.customer_segments.find_one(query)
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
        
    members = segment.get("members", [])
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Name", "Phone", "Tags", "Date Added"])
    
    for m in members:
        tags_str = ", ".join(m.get("tags", []))
        writer.writerow([m.get("name", ""), m.get("phone", ""), tags_str, m.get("addedAt", "")])
        
    output.seek(0)
    filename = f"segment_{segment.get('name', 'export').replace(' ', '_').lower()}.csv"
    
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
