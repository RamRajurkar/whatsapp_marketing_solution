"""
Celery task for sending broadcast messages via WhatsApp Cloud API.

This task is designed to be:
  - Memory-efficient: streams customers from MongoDB, never loads all into RAM
  - Crash-safe: Celery auto-retries if the worker dies mid-broadcast
  - Rate-limit aware: backs off on 429 responses from Meta
  - Observable: emits real-time progress via Socket.IO (through Redis)
"""

import asyncio
import httpx
import socketio
import os
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from bson import ObjectId

from app.celery_app import celery_app
from app.database import get_worker_db
from app.utils.template_utils import build_template_components

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
    carousel_cards: Optional[List[dict]] = None,
    audience_tags: Optional[List[str]] = None,
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
                carousel_cards=carousel_cards,
                audience_tags=audience_tags,
            )
        )
    except Exception as exc:
        print(f"[Broadcast Task] Fatal error: {exc}")
        # Mark broadcast as failed before retrying
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
    carousel_cards: Optional[List[dict]] = None,
    audience_tags: Optional[List[str]] = None,
):
    """
    Core async broadcast sender.
    
    - Streams customers from MongoDB (never loads all into RAM)
    - Sends in chunks with concurrency semaphore
    - Batches DB writes
    - Emits real-time progress
    - Retries on rate limits
    """
    client, database = get_worker_db()
    sio_mgr = _get_sio_manager()

    try:
        obj_id = ObjectId(broadcast_id)

        # ── Pre-build template payload (same for every recipient) ────────
        template_payload: Dict[str, Any] = {
            "name": template_name,
            "language": {"code": template_lang},
        }
        if template_components:
            components = build_template_components(
                template_components=template_components,
                header_media_url=header_media_url,
                header_media_id=header_media_id,
                body_params=body_params,
                carousel_cards=carousel_cards,
            )
            if components:
                template_payload["components"] = components

        # ── Count total customers ────────────────────────────────────────
        customer_query = {"tags": {"$in": audience_tags}} if audience_tags else {}
        total_count = await database.customers.count_documents(customer_query)

        await database.broadcasts.update_one(
            {"_id": obj_id},
            {"$set": {"stats.total": total_count, "updatedAt": _now()}},
        )

        # ── Send messages ────────────────────────────────────────────────
        sent_count = 0
        failed_count = 0
        message_batch: list = []
        semaphore = asyncio.Semaphore(SEMAPHORE_LIMIT)

        async def send_one(customer: dict, http_client: httpx.AsyncClient) -> dict:
            """Send a single message. Returns result dict."""
            phone = customer.get("phone", "")
            name = customer.get("name", phone)

            if not phone:
                return {"success": False, "customer": customer, "error": "no_phone"}

            async with semaphore:
                url = f"https://graph.facebook.com/{settings.WA_API_VERSION}/{wa_phone_id}/messages"
                headers = {
                    "Authorization": f"Bearer {wa_token}",
                    "Content-Type": "application/json",
                }
                payload = {
                    "messaging_product": "whatsapp",
                    "recipient_type": "individual",
                    "to": phone,
                    "type": "template",
                    "template": template_payload,
                }

                # Retry loop for rate limits
                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        resp = await http_client.post(url, json=payload, headers=headers)

                        if resp.status_code in (200, 201):
                            wa_msg_id = resp.json().get("messages", [{}])[0].get("id", "unknown")
                            return {"success": True, "customer": customer, "wa_msg_id": wa_msg_id}

                        elif resp.status_code == 429:
                            # Rate limited — back off exponentially
                            retry_after = int(resp.headers.get("Retry-After", 30 * (attempt + 1)))
                            print(f"[Broadcast] Rate limited. Waiting {retry_after}s...")
                            await asyncio.sleep(retry_after)
                            continue

                        else:
                            print(f"[Broadcast] Failed to send to {phone}: {resp.status_code} {resp.text}")
                            return {"success": False, "customer": customer, "error": resp.text}

                    except Exception as e:
                        print(f"[Broadcast] Error sending to {phone}: {e}")
                        if attempt < max_retries - 1:
                            await asyncio.sleep(2 * (attempt + 1))
                            continue
                        return {"success": False, "customer": customer, "error": str(e)}

                return {"success": False, "customer": customer, "error": "max_retries_exceeded"}

        # ── Mock mode ────────────────────────────────────────────────────
        if wa_token == "test_token":
            async for customer in database.customers.find(customer_query):
                phone = customer.get("phone", "")
                if not phone:
                    failed_count += 1
                    continue
                sent_count += 1
                wa_msg_id = f"mock_bc_{int(_now().timestamp())}_{sent_count}"
                msg_doc = _build_message_doc(customer, wa_msg_id, template_name, broadcast_id)
                message_batch.append(msg_doc)

                # Batch insert
                if len(message_batch) >= DB_BATCH_SIZE:
                    await _flush_message_batch(database, message_batch)
                    message_batch = []

                # Progress update
                if (sent_count + failed_count) % PROGRESS_INTERVAL == 0:
                    await _emit_progress(sio_mgr, database, obj_id, broadcast_id, sent_count, failed_count, total_count)

                await asyncio.sleep(0.02)

        else:
            # ── Real API — stream and chunk ──────────────────────────────
            async with httpx.AsyncClient(timeout=30.0) as http_client:
                chunk: list = []

                async for customer in database.customers.find(customer_query):
                    chunk.append(customer)

                    if len(chunk) >= CHUNK_SIZE:
                        results = await asyncio.gather(*[send_one(c, http_client) for c in chunk])
                        for r in results:
                            if r["success"]:
                                sent_count += 1
                                msg_doc = _build_message_doc(r["customer"], r["wa_msg_id"], template_name, broadcast_id)
                                message_batch.append(msg_doc)
                            else:
                                failed_count += 1

                        # Batch insert messages
                        if len(message_batch) >= DB_BATCH_SIZE:
                            await _flush_message_batch(database, message_batch)
                            message_batch = []

                        # Emit progress
                        await _emit_progress(sio_mgr, database, obj_id, broadcast_id, sent_count, failed_count, total_count)

                        chunk = []

                        # Small breathing room between chunks
                        await asyncio.sleep(0.5)

                # Process remaining customers in the last partial chunk
                if chunk:
                    results = await asyncio.gather(*[send_one(c, http_client) for c in chunk])
                    for r in results:
                        if r["success"]:
                            sent_count += 1
                            msg_doc = _build_message_doc(r["customer"], r["wa_msg_id"], template_name, broadcast_id)
                            message_batch.append(msg_doc)
                        else:
                            failed_count += 1
                            
                    # Emit progress for the partial chunk
                    await _emit_progress(sio_mgr, database, obj_id, broadcast_id, sent_count, failed_count, total_count)

        # ── Flush remaining messages ─────────────────────────────────────
        if message_batch:
            await _flush_message_batch(database, message_batch)

        # ── Final status ─────────────────────────────────────────────────
        if failed_count == 0:
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
                "stats.total": total_count,
                "sentAt": _now(),
                "updatedAt": _now(),
            }},
        )

        # Final progress emit
        await _emit_progress(sio_mgr, database, obj_id, broadcast_id, sent_count, failed_count, total_count, final_status)

        print(f"[Broadcast] Done — sent: {sent_count}, failed: {failed_count}, status: {final_status}")

    finally:
        client.close()


def _build_message_doc(customer: dict, wa_msg_id: str, template_name: str, broadcast_id: str) -> dict:
    """Build a message document for batch insertion."""
    phone = customer.get("phone", "")
    now = _now()
    return {
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


async def _flush_message_batch(database, batch: list):
    """Insert a batch of messages and create/update conversations."""
    if not batch:
        return

    # Batch insert all messages
    await database.messages.insert_many(batch)

    # Update conversations for each message
    for msg in batch:
        phone = msg["customerPhone"]
        name = msg["customerName"]
        now = msg["createdAt"]
        text = msg["content"]["text"]

        conversation = await database.conversations.find_one({"customerPhone": phone})
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

        # Set conversationId on the message (for inbox lookups)
        await database.messages.update_one(
            {"_id": msg["_id"]},
            {"$set": {"conversationId": conv_id}},
        )

    batch.clear()


async def _emit_progress(sio_mgr, database, obj_id, broadcast_id, sent, failed, total, status="sending"):
    """Emit progress update via Socket.IO and persist to DB."""
    # Update DB
    await database.broadcasts.update_one(
        {"_id": obj_id},
        {"$set": {
            "stats.sent": sent,
            "stats.failed": failed,
            "updatedAt": _now(),
        }},
    )

    # Emit to all clients in the 'broadcasts' room
    progress_data = {
        "broadcastId": broadcast_id,
        "sent": sent,
        "failed": failed,
        "total": total,
        "status": status,
        "percentage": round((sent + failed) / total * 100, 1) if total > 0 else 0,
    }
    await sio_mgr.emit("broadcast:progress", progress_data, room="broadcasts")
