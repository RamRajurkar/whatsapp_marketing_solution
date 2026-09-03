"""
Celery task for sending broadcast messages via WhatsApp Cloud API.
Enforces layered token bucket rate limits, Meta API error classification,
circuit breakers, and cost tracker billing logs.
"""

import asyncio
import httpx
import socketio
import os
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from bson import ObjectId
from pymongo import UpdateOne

from app.celery_app import celery_app
from app.database import get_worker_db
from app.utils.template_utils import build_template_components, process_header_media
from app.http_client import get_http_client
from app.utils.rate_limiter import rate_limiter
from app.utils.error_classifier import classify_meta_error
from app.utils.circuit_breaker import circuit_breaker
from app.utils.billing import log_billing_event

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Concurrency controls
SEMAPHORE_LIMIT = 10     # Max simultaneous WhatsApp API calls
CHUNK_SIZE = 10          # Process customers in batches of 10 for more live feedback
DB_BATCH_SIZE = 50       # Batch DB inserts
PROGRESS_INTERVAL = 10   # Emit progress every N messages


def _now():
    return datetime.now(timezone.utc)


def _get_sio_manager():
    """Get a Socket.IO Redis manager for emitting events from the worker."""
    return socketio.AsyncRedisManager(REDIS_URL, write_only=True)


@celery_app.task(
    bind=True,
    name="app.tasks.broadcast_task.send_broadcast",
    max_retries=3,
    default_retry_delay=30,
    acks_late=True,
)
def send_broadcast(
    self,
    broadcast_id: str,
    wa_phone_id: str,
    wa_token: str,
    template_name: str,
    template_lang: str,
    template_components: Optional[List[dict]] = None,
    header_media_url: Optional[str] = None,
    header_media_id: Optional[str] = None,
    body_params: Optional[List[str]] = None,
    button_params: Optional[List[str]] = None,
    carousel_cards: Optional[List[dict]] = None,
    audience_tags: Optional[List[str]] = None,
    tenant_id: Optional[str] = None,
    recipient_phones: Optional[List[str]] = None,
    csv_audience: Optional[List[dict]] = None,
    speed_mps: Optional[int] = None,
    daily_tier_cap: Optional[int] = None,
):
    """
    Celery task entry point. Wraps the async sender in asyncio.run().
    """
    try:
        asyncio.run(
            _async_send_broadcast(
                task=self,
                broadcast_id=broadcast_id,
                wa_phone_id=wa_phone_id,
                wa_token=wa_token,
                template_name=template_name,
                template_lang=template_lang,
                template_components=template_components,
                header_media_url=header_media_url,
                header_media_id=header_media_id,
                body_params=body_params,
                button_params=button_params,
                carousel_cards=carousel_cards,
                audience_tags=audience_tags,
                tenant_id=tenant_id,
                recipient_phones=recipient_phones,
                csv_audience=csv_audience,
                speed_mps=speed_mps,
                daily_tier_cap=daily_tier_cap,
            )
        )
    except Exception as exc:
        print(f"[Broadcast Task] Fatal error: {exc}")
        asyncio.run(_mark_broadcast_failed(broadcast_id, str(exc)))
        raise self.retry(exc=exc)


async def _mark_broadcast_failed(broadcast_id: str, error: str):
    """Mark a broadcast as failed in the DB."""
    client, database = get_worker_db()
    try:
        await database.broadcasts.update_one(
            {"_id": ObjectId(broadcast_id)},
            {"$set": {
                "status": "failed",
                "error": error,
                "updatedAt": _now(),
            }},
        )
    finally:
        client.close()


async def _async_send_broadcast(
    task,
    broadcast_id: str,
    wa_phone_id: str,
    wa_token: str,
    template_name: str,
    template_lang: str,
    template_components: Optional[List[dict]] = None,
    header_media_url: Optional[str] = None,
    header_media_id: Optional[str] = None,
    body_params: Optional[List[str]] = None,
    button_params: Optional[List[str]] = None,
    carousel_cards: Optional[List[dict]] = None,
    audience_tags: Optional[List[str]] = None,
    tenant_id: Optional[str] = None,
    recipient_phones: Optional[List[str]] = None,
    csv_audience: Optional[List[dict]] = None,
    speed_mps: Optional[int] = None,
    daily_tier_cap: Optional[int] = None,
):
    """
    Core async broadcast sender with rate limiting, error routing, and billing.
    """
    client, database = get_worker_db()
    sio_mgr = _get_sio_manager()

    try:
        obj_id = ObjectId(broadcast_id)

        # Verify broadcast document & status before proceeding
        bc_doc = await database.broadcasts.find_one({"_id": obj_id})
        if not bc_doc or bc_doc.get("status") in ("paused", "cancelled", "completed"):
            print(f"[Broadcast Task] Skipping execution for {broadcast_id} as status is {bc_doc.get('status') if bc_doc else 'deleted'}")
            return

        # Resolve dynamic rate limits (MPS and Daily Tier Cap) from settings / user profile / payload
        effective_mps = speed_mps or (bc_doc.get("speedMps") if bc_doc else None) or 25
        effective_daily_cap = daily_tier_cap or 250

        if tenant_id:
            try:
                user_doc = await database.users.find_one({"_id": ObjectId(tenant_id)})
            except Exception:
                user_doc = await database.users.find_one({"_id": tenant_id})
            if user_doc:
                if not speed_mps and not bc_doc.get("speedMps") and user_doc.get("maxMpsLimit"):
                    effective_mps = int(user_doc.get("maxMpsLimit"))
                if not daily_tier_cap and user_doc.get("dailyTierLimit"):
                    effective_daily_cap = int(user_doc.get("dailyTierLimit"))

        print(f"[Broadcast Worker] Active Rate Limit Controls -> Max Speed: {effective_mps} MPS | Daily Tier Cap: {effective_daily_cap}")

        await database.broadcasts.update_one({"_id": obj_id}, {"$set": {"status": "sending", "updatedAt": _now()}})

        # ── Pre-build template payload ───────────────────────────────────
        template_payload: Dict[str, Any] = {
            "name": template_name,
            "language": {"code": template_lang},
        }

        # Process header media (auto-convert local file or external link to Meta Media ID)
        if (header_media_url or header_media_id) and wa_token != "test_token":
            try:
                header_media_url, header_media_id = await process_header_media(
                    header_media_url=header_media_url,
                    header_media_id=header_media_id,
                    wa_phone_id=wa_phone_id,
                    wa_token=wa_token,
                )
            except Exception as media_err:
                print(f"[Broadcast Task] Failed to process header media: {media_err}")

        # Auto-fetch template components from Meta API if missing
        if not template_components and wa_token != "test_token":
            try:
                waba_id = os.getenv("WA_BUSINESS_ACCOUNT_ID", "")
                if not waba_id:
                    u_doc = await database.users.find_one({"waPhoneNumberId": wa_phone_id})
                    waba_id = u_doc.get("waBusinessAccountId", "") if u_doc else ""

                if waba_id:
                    client_http = get_http_client()
                    tmpl_res = await client_http.get(
                        f"https://graph.facebook.com/v20.0/{waba_id}/message_templates",
                        params={"name": template_name, "access_token": wa_token},
                        timeout=10.0,
                    )
                    if tmpl_res.status_code == 200:
                        tmpl_data = tmpl_res.json().get("data", [])
                        if tmpl_data:
                            template_components = tmpl_data[0].get("components", [])
            except Exception as tmpl_err:
                print(f"[Broadcast Task] Could not auto-fetch template components: {tmpl_err}")

        if template_components:
            components = build_template_components(
                template_components=template_components,
                header_media_url=header_media_url,
                header_media_id=header_media_id,
                body_params=body_params,
                button_params=button_params,
                carousel_cards=carousel_cards,
            )
            if components:
                template_payload["components"] = components

        # Resolve csv_audience from database.broadcast_audiences or customer_segments if not passed directly
        if not csv_audience and bc_doc and bc_doc.get("audienceType") == "csv":
            aud_cursor = database.broadcast_audiences.find({"broadcastId": broadcast_id}).sort("chunk_index", 1)
            csv_audience = []
            async for aud_doc in aud_cursor:
                csv_audience.extend(aud_doc.get("recipients", []))

        elif not csv_audience and bc_doc and bc_doc.get("audienceType") == "segment":
            segment_id = bc_doc.get("segmentId")
            if segment_id:
                try:
                    seg_doc = await database.customer_segments.find_one({"_id": ObjectId(segment_id)})
                except Exception:
                    seg_doc = await database.customer_segments.find_one({"_id": segment_id})
                if seg_doc:
                    members = seg_doc.get("members", [])
                    csv_audience = [
                        {"phone": m.get("phone"), "name": m.get("name", m.get("phone")), "params": []}
                        for m in members if m.get("phone")
                    ]

        # ── Count total customers ────────────────────────────────────────
        if csv_audience:
            total_count = len(csv_audience)
            customer_query = {}
        elif recipient_phones:
            customer_query = {"phone": {"$in": recipient_phones}}
            if tenant_id:
                customer_query["tenantId"] = tenant_id
            total_count = await database.customers.count_documents(customer_query)
        elif audience_tags:
            customer_query = {"tags": {"$in": audience_tags}}
            if tenant_id:
                customer_query["tenantId"] = tenant_id
            total_count = await database.customers.count_documents(customer_query)
        else:
            customer_query = {}
            if tenant_id:
                customer_query["tenantId"] = tenant_id
            total_count = await database.customers.count_documents(customer_query)

        await database.broadcasts.update_one(
            {"_id": obj_id},
            {"$set": {"stats.total": total_count, "updatedAt": _now()}},
        )

        async def get_customers():
            if csv_audience:
                for item in csv_audience:
                    yield item
            else:
                async for c in database.customers.find(customer_query):
                    yield c

        # ── Send messages ────────────────────────────────────────────────
        sent_count = 0
        failed_count = 0
        freq_capped_count = 0
        message_batch: list = []
        recipient_batch: list = []
        semaphore = asyncio.Semaphore(SEMAPHORE_LIMIT)

        async def send_one(customer: dict, http_client: httpx.AsyncClient) -> dict:
            """Send a single message incorporating all safety shields."""
            phone = customer.get("phone", "")
            if not phone:
                return {
                    "success": False,
                    "customer": customer,
                    "error": "no_phone",
                    "error_code": 400,
                    "error_reason": "Missing phone number",
                    "is_retryable": False,
                    "status": "failed",
                }

            # 1. Circuit Breaker Check
            if tenant_id and circuit_breaker.is_circuit_tripped(tenant_id):
                return {
                    "success": False,
                    "customer": customer,
                    "error": "circuit_breaker_tripped",
                    "error_code": 503,
                    "error_reason": "Tenant circuit breaker tripped due to high error rate",
                    "is_retryable": True,
                    "status": "failed",
                }

            # 2. Monthly Tenant Quota Check
            if tenant_id and not rate_limiter.check_monthly_tenant_quota(tenant_id):
                return {
                    "success": False,
                    "customer": customer,
                    "error": "monthly_quota_exceeded",
                    "error_code": 429,
                    "error_reason": "Monthly tenant message quota exceeded",
                    "is_retryable": False,
                    "status": "failed",
                }

            # 3. Dynamic MPS Throttle Check
            while not rate_limiter.consume_throughput(wa_phone_id, limit_mps=effective_mps):
                await asyncio.sleep(0.05)

            # 4. Daily Portfolio Unique Cap Check
            if not rate_limiter.check_daily_unique_recipient(wa_phone_id, phone, daily_cap=effective_daily_cap):
                return {
                    "success": False,
                    "customer": customer,
                    "error": "daily_unique_ceiling_exceeded",
                    "error_code": 429,
                    "error_reason": f"Daily portfolio unique recipient limit reached ({effective_daily_cap} cap)",
                    "is_retryable": True,
                    "status": "failed",
                }

            # Build per-recipient template payload if row contains custom params or dynamic button params
            raw_row = customer.get("raw_row", {})
            cust_params = customer.get("params")

            cust_button_params = []
            if button_params:
                for bp in button_params:
                    if raw_row and bp in raw_row:
                        cust_button_params.append(raw_row[bp])
                    else:
                        cust_button_params.append(bp)

            if (cust_params or cust_button_params) and template_components:
                cust_components = build_template_components(
                    template_components=template_components,
                    header_media_url=header_media_url,
                    header_media_id=header_media_id,
                    body_params=cust_params,
                    button_params=cust_button_params if cust_button_params else button_params,
                    carousel_cards=carousel_cards,
                )
                target_tmpl_payload = {
                    "name": template_name,
                    "language": {"code": template_lang},
                    "components": cust_components,
                }
            else:
                target_tmpl_payload = template_payload

            async with semaphore:
                url = f"https://graph.facebook.com/v20.0/{wa_phone_id}/messages"
                headers = {
                    "Authorization": f"Bearer {wa_token}",
                    "Content-Type": "application/json",
                }
                payload = {
                    "messaging_product": "whatsapp",
                    "recipient_type": "individual",
                    "to": phone,
                    "type": "template",
                    "template": target_tmpl_payload,
                }

                max_retries = 3
                last_error_code = 500
                last_error_reason = "Max retries exceeded / rate limit backoff"

                for attempt in range(max_retries):
                    try:
                        resp = await http_client.post(url, json=payload, headers=headers)

                        if resp.status_code in (200, 201):
                            wa_msg_id = resp.json().get("messages", [{}])[0].get("id", "unknown")
                            
                            # Success: Report to Circuit Breaker + Log Billing Event
                            if tenant_id:
                                circuit_breaker.record_send_result(tenant_id, success=True)
                                rate_limiter.increment_monthly_tenant_count(tenant_id)
                                
                            # Deduplicated Cost log
                            await log_billing_event(tenant_id, wa_msg_id, "marketing", phone)
                            
                            return {"success": True, "customer": customer, "wa_msg_id": wa_msg_id}

                        # Parse Meta Specific Error
                        try:
                            resp_json = resp.json()
                            error_data = resp_json.get("error", {})
                        except Exception:
                            error_data = {}

                        error_code = error_data.get("code", 0)
                        exact_error_msg = error_data.get("message") or str(resp.text)
                        error_details = error_data.get("error_data", {}).get("details")
                        if error_details:
                            exact_error_msg += f" ({error_details})"

                        last_error_code = error_code or resp.status_code
                        last_error_reason = f"[#{last_error_code}] {exact_error_msg}"

                        classification = classify_meta_error(error_code)

                        # Report Failure to Circuit Breaker
                        if tenant_id:
                            circuit_breaker.record_send_result(tenant_id, success=False)

                        if classification["is_permanent"]:
                            print(f"[Broadcast] Permanent error {error_code} for {phone}: {exact_error_msg}")
                            return {
                                "success": False,
                                "customer": customer,
                                "error_code": error_code,
                                "error_reason": f"[#{error_code}] {exact_error_msg}",
                                "is_retryable": False,
                                "status": "failed",
                            }

                        # Handle backoffs based on error classification
                        retry_delay = classification["retry_delay"]
                        if classification["action"] == "retry_short" and attempt < max_retries - 1:
                            print(f"[Broadcast] Short throttle error {error_code}. Retrying in {retry_delay}s...")
                            await asyncio.sleep(retry_delay)
                            continue
                        elif classification["action"] == "retry_medium" and attempt < max_retries - 1:
                            print(f"[Broadcast] Medium busy state {error_code}. Retrying in {retry_delay}s...")
                            await asyncio.sleep(retry_delay)
                            continue
                        elif classification["action"] == "retry_long" or error_code == 131049:
                            # Frequency capped or long delay — record as frequency_capped for deferred 24h retry
                            return {
                                "success": False,
                                "customer": customer,
                                "error_code": error_code,
                                "error_reason": f"[#{error_code}] {classification['message']}",
                                "is_retryable": True,
                                "status": "frequency_capped",
                            }

                    except Exception as e:
                        print(f"[Broadcast] Network connection error: {e}")
                        last_error_code = 500
                        last_error_reason = str(e)
                        if tenant_id:
                            circuit_breaker.record_send_result(tenant_id, success=False)
                        if attempt < max_retries - 1:
                            await asyncio.sleep(2 * (attempt + 1))
                            continue
                        return {
                            "success": False,
                            "customer": customer,
                            "error_code": 500,
                            "error_reason": str(e),
                            "is_retryable": True,
                            "status": "failed",
                        }

                return {
                    "success": False,
                    "customer": customer,
                    "error_code": last_error_code,
                    "error_reason": last_error_reason,
                    "is_retryable": True,
                    "status": "failed",
                }

        # ── Mock mode ────────────────────────────────────────────────────
        if wa_token == "test_token":
            async for customer in get_customers():
                phone = customer.get("phone", "")
                if not phone:
                    failed_count += 1
                    rec_doc = _build_recipient_doc(customer, broadcast_id, status="failed", error_code=400, error_reason="Missing phone number", is_retryable=False, tenant_id=tenant_id)
                    recipient_batch.append(rec_doc)
                    continue
                sent_count += 1
                wa_msg_id = f"mock_bc_{int(_now().timestamp())}_{sent_count}"
                msg_doc = _build_message_doc(customer, wa_msg_id, template_name, broadcast_id, tenant_id)
                rec_doc = _build_recipient_doc(customer, broadcast_id, status="sent", wa_msg_id=wa_msg_id, tenant_id=tenant_id)
                message_batch.append(msg_doc)
                recipient_batch.append(rec_doc)

                # Batch insert
                if len(message_batch) >= DB_BATCH_SIZE:
                    await _flush_message_batch(database, message_batch, tenant_id)
                    await _flush_recipient_batch(database, recipient_batch)
                    message_batch = []
                    recipient_batch = []

                if (sent_count + failed_count) % PROGRESS_INTERVAL == 0:
                    await _emit_progress(sio_mgr, database, obj_id, broadcast_id, sent_count, failed_count, freq_capped_count, total_count)

                await asyncio.sleep(0.02)

        else:
            # ── Real API — stream and chunk ──────────────────────────────
            http_client = get_http_client()
            chunk: list = []

            async for customer in get_customers():
                chunk.append(customer)

                if len(chunk) >= CHUNK_SIZE:
                    results = await asyncio.gather(*[send_one(c, http_client) for c in chunk])
                    for r in results:
                        if r["success"]:
                            sent_count += 1
                            msg_doc = _build_message_doc(r["customer"], r["wa_msg_id"], template_name, broadcast_id, tenant_id)
                            rec_doc = _build_recipient_doc(r["customer"], broadcast_id, status="sent", wa_msg_id=r["wa_msg_id"], tenant_id=tenant_id)
                            message_batch.append(msg_doc)
                            recipient_batch.append(rec_doc)
                        else:
                            status_type = r.get("status", "failed")
                            if status_type == "frequency_capped":
                                freq_capped_count += 1
                            else:
                                failed_count += 1

                            rec_doc = _build_recipient_doc(
                                customer=r["customer"],
                                broadcast_id=broadcast_id,
                                status=status_type,
                                error_code=r.get("error_code"),
                                error_reason=r.get("error_reason"),
                                is_retryable=r.get("is_retryable", True),
                                tenant_id=tenant_id,
                            )
                            recipient_batch.append(rec_doc)

                    if len(message_batch) >= DB_BATCH_SIZE or len(recipient_batch) >= DB_BATCH_SIZE:
                        await _flush_message_batch(database, message_batch, tenant_id)
                        await _flush_recipient_batch(database, recipient_batch)
                        message_batch = []
                        recipient_batch = []

                    await _emit_progress(sio_mgr, database, obj_id, broadcast_id, sent_count, failed_count, freq_capped_count, total_count)
                    chunk = []
                    await asyncio.sleep(0.5)

            if chunk:
                results = await asyncio.gather(*[send_one(c, http_client) for c in chunk])
                for r in results:
                    if r["success"]:
                        sent_count += 1
                        msg_doc = _build_message_doc(r["customer"], r["wa_msg_id"], template_name, broadcast_id, tenant_id)
                        rec_doc = _build_recipient_doc(r["customer"], broadcast_id, status="sent", wa_msg_id=r["wa_msg_id"], tenant_id=tenant_id)
                        message_batch.append(msg_doc)
                        recipient_batch.append(rec_doc)
                    else:
                        status_type = r.get("status", "failed")
                        if status_type == "frequency_capped":
                            freq_capped_count += 1
                        else:
                            failed_count += 1

                        rec_doc = _build_recipient_doc(
                            customer=r["customer"],
                            broadcast_id=broadcast_id,
                            status=status_type,
                            error_code=r.get("error_code"),
                            error_reason=r.get("error_reason"),
                            is_retryable=r.get("is_retryable", True),
                            tenant_id=tenant_id,
                        )
                        recipient_batch.append(rec_doc)
                        
                await _emit_progress(sio_mgr, database, obj_id, broadcast_id, sent_count, failed_count, freq_capped_count, total_count)

        # ── Flush remaining messages & recipients ────────────────────────
        if message_batch:
            await _flush_message_batch(database, message_batch, tenant_id)
        if recipient_batch:
            await _flush_recipient_batch(database, recipient_batch)

        # ── Final status ─────────────────────────────────────────────────
        if (failed_count + freq_capped_count) == 0:
            final_status = "sent"
        elif sent_count == 0:
            final_status = "failed"
        else:
            final_status = "partial"

        await database.broadcasts.update_one(
            {"_id": obj_id},
            {"$set": {
                "status": final_status,
                "stats.sent": sent_count,
                "stats.failed": failed_count,
                "stats.frequencyCapped": freq_capped_count,
                "stats.total": total_count,
                "sentAt": _now(),
                "updatedAt": _now(),
            }},
        )

        await _emit_progress(sio_mgr, database, obj_id, broadcast_id, sent_count, failed_count, freq_capped_count, total_count, final_status)
        print(f"[Broadcast] Done — sent: {sent_count}, failed: {failed_count}, frequency_capped: {freq_capped_count}, status: {final_status}")

    finally:
        client.close()


def _build_message_doc(
    customer: dict, 
    wa_msg_id: str, 
    template_name: str, 
    broadcast_id: str,
    tenant_id: Optional[str] = None
) -> dict:
    """Build a message document for batch insertion."""
    phone = customer.get("phone", "")
    now = _now()
    doc = {
        "customerPhone": phone,
        "customerName": customer.get("name", phone),
        "whatsappMessageId": wa_msg_id,
        "direction": "outbound",
        "type": "template",
        "content": {"text": f"[Template: {template_name}]", "templateName": template_name},
        "status": "sent",
        "broadcastId": broadcast_id,
        "timestamp": now,
        "createdAt": now,
    }
    if tenant_id:
        doc["tenantId"] = tenant_id
    return doc


def _build_recipient_doc(
    customer: dict,
    broadcast_id: str,
    status: str,
    wa_msg_id: Optional[str] = None,
    error_code: Optional[int] = None,
    error_reason: Optional[str] = None,
    is_retryable: bool = False,
    tenant_id: Optional[str] = None,
) -> dict:
    """Build a recipient tracking document."""
    phone = customer.get("phone", "")
    now = _now()
    doc = {
        "broadcastId": broadcast_id,
        "customerPhone": phone,
        "customerName": customer.get("name", phone),
        "status": status,
        "whatsappMessageId": wa_msg_id,
        "errorCode": error_code,
        "errorReason": error_reason,
        "isRetryable": is_retryable,
        "isPaused": False,
        "retryCount": 0,
        "lastAttemptAt": now,
        "createdAt": now,
        "updatedAt": now,
    }
    if tenant_id:
        doc["tenantId"] = tenant_id
    return doc


async def _flush_recipient_batch(database, batch: list):
    """Insert or update recipient tracking documents using bulk upserts."""
    if not batch:
        return
    ops = []
    for rec in batch:
        filter_q = {"broadcastId": rec["broadcastId"], "customerPhone": rec["customerPhone"]}
        rec_copy = dict(rec)
        status_val = rec_copy.pop("status", "sent")
        ops.append(
            UpdateOne(
                filter_q,
                {
                    "$set": rec_copy,
                    "$setOnInsert": {"status": status_val}
                },
                upsert=True
            )
        )
    if ops:
        await database.broadcast_recipients.bulk_write(ops, ordered=False)
    batch.clear()


async def _flush_message_batch(database, batch: list, tenant_id: Optional[str] = None):
    """Insert a batch of messages and create/update conversations."""
    if not batch:
        return

    await database.messages.insert_many(batch)

    for msg in batch:
        phone = msg["customerPhone"]
        name = msg["customerName"]
        now = msg["createdAt"]
        text = msg["content"]["text"]

        conv_query = {"customerPhone": phone}
        if tenant_id:
            conv_query["tenantId"] = tenant_id

        conversation = await database.conversations.find_one(conv_query)
        if not conversation:
            conv_doc = {
                "customerPhone": phone,
                "customerName": name,
                "lastMessage": text,
                "lastMessageTime": now,
                "unreadCount": 0,
                "createdAt": now,
                "updatedAt": now,
            }
            if tenant_id:
                conv_doc["tenantId"] = tenant_id
            result = await database.conversations.insert_one(conv_doc)
            conv_id = str(result.inserted_id)
        else:
            conv_id = str(conversation["_id"])
            await database.conversations.update_one(
                {"_id": conversation["_id"]},
                {"$set": {
                    "lastMessage": text,
                    "lastMessageTime": now,
                    "updatedAt": now,
                }},
            )

        await database.messages.update_one(
            {"_id": msg["_id"]},
            {"$set": {"conversationId": conv_id}},
        )

    batch.clear()


async def _emit_progress(sio_mgr, database, obj_id, broadcast_id, sent, failed, freq_capped, total, status="sending"):
    """Emit progress update via Socket.IO and persist to DB."""
    await database.broadcasts.update_one(
        {"_id": obj_id},
        {"$set": {
            "stats.sent": sent,
            "stats.failed": failed,
            "stats.frequencyCapped": freq_capped,
            "updatedAt": _now(),
        }},
    )

    progress_data = {
        "broadcastId": broadcast_id,
        "sent": sent,
        "failed": failed,
        "frequencyCapped": freq_capped,
        "total": total,
        "status": status,
        "percentage": round((sent + failed + freq_capped) / total * 100, 1) if total > 0 else 0,
    }
    await sio_mgr.emit("broadcast:progress", progress_data, room="broadcasts")


@celery_app.task(
    name="app.tasks.broadcast_task.auto_retry_frequency_capped_recipients",
)
def auto_retry_frequency_capped_recipients():
    """
    Background cron job to auto-retry frequency-capped recipients (#131049)
    whose 24-hour Meta window has elapsed.
    """
    asyncio.run(_async_auto_retry_frequency_capped())


async def _async_auto_retry_frequency_capped():
    client, database = get_worker_db()
    try:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(hours=24)

        # Find frequency-capped recipients whose last attempt was >= 24h ago
        query = {
            "status": "frequency_capped",
            "isRetryable": True,
            "isPaused": {"$ne": True},
            "lastAttemptAt": {"$lte": cutoff},
        }

        cursor = database.broadcast_recipients.find(query)
        recipients = await cursor.to_list(length=1000)
        if not recipients:
            return

        # Group by broadcastId
        grouped: dict = {}
        for r in recipients:
            bc_id = r.get("broadcastId")
            if bc_id:
                grouped.setdefault(bc_id, []).append(r["customerPhone"])

        for bc_id, phones in grouped.items():
            try:
                bc = await database.broadcasts.find_one({"_id": ObjectId(bc_id)})
                if not bc or bc.get("isPaused"):
                    continue

                tenant_id = bc.get("tenantId")
                wa_phone_id = os.getenv("WA_PHONE_NUMBER_ID", "")
                wa_token = os.getenv("WA_ACCESS_TOKEN", "")

                send_broadcast.delay(
                    broadcast_id=bc_id,
                    wa_phone_id=wa_phone_id,
                    wa_token=wa_token,
                    template_name=bc["templateName"],
                    template_lang=bc.get("templateLanguage", "en"),
                    template_components=bc.get("templateComponents"),
                    header_media_url=bc.get("headerMediaUrl"),
                    header_media_id=bc.get("headerMediaId"),
                    body_params=bc.get("bodyParams"),
                    carousel_cards=bc.get("carouselCards"),
                    audience_tags=None,
                    tenant_id=tenant_id,
                    recipient_phones=phones,
                )
                print(f"[Auto Retry] Triggered 24h frequency cap retry for broadcast {bc_id} ({len(phones)} recipients)")
            except Exception as e:
                print(f"[Auto Retry] Error processing broadcast {bc_id}: {e}")

    finally:
        client.close()

