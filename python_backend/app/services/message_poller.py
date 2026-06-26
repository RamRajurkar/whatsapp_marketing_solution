"""
Missed Message Catchup System
==============================
On startup, fetches any unprocessed webhook payloads from Supabase
(queued by the Cloudflare Worker while the PC was offline) and replays
them through the existing webhook processing pipeline.
"""

import httpx
from app.config import settings
from app.routes.webhook import _process_webhook_body
from app.http_client import get_http_client


# ─────────────────────────────────────────────────────────────────────────────
#  Supabase helpers
# ─────────────────────────────────────────────────────────────────────────────

def _supabase_headers() -> dict:
    """Return the standard headers for Supabase REST API calls."""
    return {
        "apikey": settings.SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_ANON_KEY}",
        "Content-Type": "application/json",
    }


async def fetch_pending_messages() -> list[dict]:
    """
    Fetch all rows from ``pending_messages`` where ``processed = false``,
    ordered by ``received_at`` ascending (oldest first).
    """
    url = (
        f"{settings.SUPABASE_URL}/rest/v1/pending_messages"
        "?processed=eq.false"
        "&order=received_at.asc"
    )
    client = get_http_client()
    resp = await client.get(url, headers=_supabase_headers())
    resp.raise_for_status()
    return resp.json()


async def mark_as_processed(message_id: str) -> None:
    """Set ``processed = true`` for the given ``pending_messages`` row."""
    url = f"{settings.SUPABASE_URL}/rest/v1/pending_messages?id=eq.{message_id}"
    client = get_http_client()
    resp = await client.patch(
        url,
        json={"processed": True},
        headers={**_supabase_headers(), "Prefer": "return=minimal"},
    )
    resp.raise_for_status()


# ─────────────────────────────────────────────────────────────────────────────
#  Main catchup routine (called once at startup)
# ─────────────────────────────────────────────────────────────────────────────

async def catchup_missed_messages() -> None:
    """
    Replay every unprocessed Supabase payload through the existing
    webhook handler, then mark each as processed.

    Errors on individual messages are logged but do **not** stop the loop
    so that remaining messages still get processed.
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
        print("[CATCHUP] Supabase not configured — skipping missed-message catchup")
        return

    print("[CATCHUP] Fetching pending messages from Supabase …")

    try:
        pending = await fetch_pending_messages()
    except Exception as exc:
        print(f"[CATCHUP] Failed to fetch pending messages: {exc}")
        return

    if not pending:
        print("[CATCHUP] No pending messages — nothing to catch up")
        return

    print(f"[CATCHUP] Found {len(pending)} missed message(s) — processing …")

    processed_count = 0
    error_count = 0

    for row in pending:
        row_id = row.get("id")
        payload = row.get("payload")

        if not payload:
            print(f"[CATCHUP] Row {row_id} has no payload — skipping")
            continue

        try:
            await _process_webhook_body(payload)
            await mark_as_processed(row_id)
            processed_count += 1
            print(f"[CATCHUP] ✓ Processed message {row_id}")
        except Exception as exc:
            error_count += 1
            print(f"[CATCHUP] ✗ Error processing message {row_id}: {exc}")

    print(
        f"[CATCHUP] Catchup complete — "
        f"{processed_count} processed, {error_count} errors"
    )
