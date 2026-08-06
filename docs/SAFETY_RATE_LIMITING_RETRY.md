# Safety Measures — Rate Limiting, Retry Strategy & WhatsApp Platform Limits

This is a reference document, not a phase — consult it while implementing Phases 1, 2, 7, and 8, and re-check it periodically since Meta changes these numbers and policies on its own schedule (noted where this has already changed multiple times recently).

---

## 1. WhatsApp Cloud API limits you're actually operating under (current as of mid-2026)

Your own rate limiter (Phase 1's Redis token bucket) must sit **underneath** these Meta-imposed ceilings, not just be an internal courtesy limit — hitting these from your own send volume causes real failures (error codes below), not just slower delivery.

### 1.1 Messaging tier (daily unique-recipient reach)

This caps how many **unique** customers you can send business-initiated (template) messages to per rolling 24-hour period — it does not cap replies within an open service window.

- Newly created, unverified business portfolios start at **Tier 0: 250 unique recipients/24h**. Newly created business portfolios have a messaging limit of 250, unverified.
- After Meta Business Manager verification, accounts move to Tier 1 and beyond: 1,000, then 2,000, 10,000, 100,000, and ultimately unlimited, based on quality rating and sustained volume.
- Automatic scaling requires delivering 2,000 messages outside customer service windows to unique numbers within a 30-day period using high-quality-rated templates — Meta then automatically decides whether to increase your limit and notifies you via email and a `business_capability_update` webhook.
- **Critical architectural point**: since October 2025, messaging limits apply per Business Portfolio, not per phone number — if you run multiple client numbers under one portfolio, they share one pooled daily limit. Your rate limiter and capacity planning must account for shared portfolio pools, not treat each client number as independently capped, if they share a portfolio.
- Meta now checks for tier-upgrade eligibility every 6 hours, replacing the older 24–48 hour review cycle — your monitoring should poll `whatsapp_business_manager_messaging_limit` periodically and alert on unexpected downgrades, not just assume the tier is static.
- Service messages (replies within an open 24-hour customer-initiated window) do not count toward this limit at all — correctly distinguishing "business-initiated new conversation" from "reply within an open window" in your dispatcher is what keeps this limit from being consumed unnecessarily.

### 1.2 Throughput (messages per second — a separate limit from the above)

- Standard Cloud API throughput starts at 80 messages per second.
- An automatic upgrade to up to 1,000 mps is available once you have an unlimited messaging tier, a Yellow or Green quality score, and have sent to 100,000+ unique users within 24 hours outside support windows — this upgrade is free, not a paid tier.
- Numbers used in "coexistence" mode (shared between the Cloud API and the regular WhatsApp Business App) are fixed at 20 mps and cannot be upgraded — if any client number is coexistence-mode, your rate limiter needs a per-number override, not a single global assumption.
- Throughput is a **speed** limit, distinct from the daily **volume** (tier) limit above — you can be well within your daily tier and still get throttled if you burst too fast.
- **Error code to watch for**: 130429 means you exceeded your throughput limit and must slow down; it clears once you're back within your allowed rate. Your `classify_meta_error()` (Phase 2) should treat 130429 as a distinct, short-backoff-and-retry case, not lump it in with generic transient errors, since retrying immediately at the same rate just repeats the failure.

### 1.3 Frequency capping (per-user, cross-business)

- Users can receive roughly 2 marketing messages per day, counted across all businesses messaging them, not just yours — exceeding this triggers error code 131049 ("saturation").
- This is invisible to you until it happens: a user might be well within your own sending cadence and still get capped because of messages from other businesses. Your retry-policy design (already documented in your `pricing_table.py`/error-classification logic as `131049`) should treat this as a long-delay retry (your existing 24h/24h/48h schedule is aligned with this), not a permanent failure and not an immediate retry.
- Frequency capping and portfolio pacing (staggering large bursts) are both explicit anti-spam protections Meta enforces — this is additional justification for the staggered/batched dispatch design in Phase 1, beyond just protecting your own infrastructure.

### 1.4 Quality rating — the gatekeeper behind all of the above

- Quality rating (High/Green, Medium/Yellow, Low/Red) is driven by user blocks and spam reports, and directly controls tier eligibility.
- A sustained Low/Red rating for 7 consecutive days triggers an automatic downgrade of your daily capacity tier.
- **Production requirement**: surface quality rating per client number on your ops dashboard, and alert proactively on a drop to Medium/Low — don't let this be something you only discover when campaigns start silently failing to send.

### 1.5 Webhook responsiveness requirement

- Meta expects webhook responses with median latency under 250ms, and will retry failed webhook deliveries for up to 7 days. This is the concrete number behind Phase 1's "webhook must not do synchronous business logic" design — validate this is actually measured in production (p50/p95 webhook response time), not assumed from the architecture alone.

### 1.6 Regional/policy restrictions

- As of this writing, US-directed marketing templates are currently paused per some sources reporting an April 2025 restriction. **Confirm current status directly against Meta's official documentation before launch or before onboarding any client sending to US numbers** — this is exactly the kind of platform-policy detail that can change without much notice, and getting it wrong risks message rejection or account-level penalties, not just a failed send.

---

## 2. Your own rate limiting design (sits underneath all of the above)

Your internal rate limiter is not a substitute for respecting Meta's limits — it's how you avoid ever hitting them in the first place, plus how you protect shared infrastructure from one tenant's campaign.

### 2.1 Token bucket, per category, per tenant, per phone number

```python
class RateLimiter:
    """
    Layered limiter — a send must pass ALL applicable layers:
      1. Per-phone-number throughput (Meta's mps ceiling, e.g. 80 or 1000)
      2. Per-portfolio daily tier ceiling (Meta's unique-recipient cap)
      3. Per-tenant configured ceiling (your own commercial/fairness limit — always <= Meta's)
      4. Per-category limiter (marketing vs utility vs authentication have different risk profiles)
    """
    def try_consume(self, phone_number_id: str, business_id: str, category: str) -> bool:
        return (
            self._consume(f"mps:{phone_number_id}") and
            self._consume(f"daily_tier:{phone_number_id}") and
            self._consume(f"tenant_quota:{business_id}") and
            self._consume(f"category:{business_id}:{category}")
        )
```

Set the `mps` layer's actual number **below** Meta's documented ceiling for your number's current tier (e.g. cap at 70/s if Meta allows 80/s) — headroom matters because Meta's own enforcement isn't always instant-and-precise at the exact boundary, and a hard failure at the boundary is worse than slightly slower sending.

### 2.2 Retry policy — the classification table your system should implement

| Error code | Meaning | Action | Backoff |
|---|---|---|---|
| `131047` | Invalid/unregistered number | Skip, mark job failed permanently | none — do not retry |
| `131026` | Recipient opted out | Skip, mark job failed permanently, flag contact as opted-out | none — do not retry, and suppress future sends to this contact |
| `132000` | Template rejected/mismatched params | Skip this job; alert — likely a template config bug, not a per-recipient issue | none — but alert loudly, this usually means every recipient in the campaign will fail the same way |
| `131049` | Frequency capping (this contact is saturated across businesses) | Retry, long delay | 24h → 24h → 48h (existing schedule) |
| `130429` | Your own throughput exceeded | Retry, short delay, and reduce internal mps setpoint temporarily | 15s, with an internal circuit-breaker that lowers the mps ceiling for a cooldown window if this repeats |
| `131057` | Number undergoing tier/quality update (temporary busy state per some sources) | Retry, short-to-medium delay | ~60s |
| Generic 5xx / timeout / connection error | Transient infra issue on Meta's side or yours | Retry, short delay, capped attempts | 15s, 30s, 60s, then dead-letter for manual review |
| Any unrecognized code | Unknown — do not assume | Treat as transient with capped retries, log loudly for a human to classify and add to this table | 15s, capped at 3 attempts, then dead-letter |

**Important production-readiness note**: your current documented classification only explicitly covers `131047`, `131026`, `132000`, and `131049`. Real production traffic will surface more codes than that (130429 and 131057 above, and others). The "unrecognized code" row is not optional — it's what prevents an unhandled error code from either silently retrying forever or silently being dropped. Log every unrecognized code with enough context (full error payload, recipient, campaign) that a human can add proper handling for it quickly.

### 2.3 Circuit breaker for your own send pipeline

Independent of per-message retry logic, track your **aggregate error rate** over a rolling window (e.g. last 60 seconds of send attempts). If it crosses a threshold (e.g. >20% failures), trip a circuit breaker that pauses new dispatch for that phone number/tenant for a cooldown period, rather than continuing to hammer a clearly-failing path. This protects your quality rating (repeated failed sends can itself be a signal Meta uses) and protects your infrastructure from wasted retry load.

### 2.4 Idempotency — required at every write triggered by an external event

- Webhook ingestion: dedupe on Meta's own message/event ID before processing (`meta_message_id`), so a retried webhook delivery (which Meta explicitly does for up to 7 days on failure) is a no-op the second time.
- Billing: dedupe on `meta_message_id` in `billing_events` before inserting — this is already partially designed in your existing billing engine; confirm it's actually enforced with a unique index, not just an application-level check that can race under concurrent workers.
- Campaign job status updates: use conditional updates (`update_one` with a status-transition guard, e.g. only allow `pending → sent`, never re-apply `sent → sent`) so duplicate delivery-receipt webhooks can't double-process a job.

### 2.5 Safe worker-crash recovery ordering

For any task that both calls an external API (Meta) and writes to your DB, order operations so a crash between the two steps is always safely retryable:

1. Mark the job `"in_progress"` with a timestamp (so a monitor can detect and requeue a stuck job after a timeout).
2. Call the Meta API.
3. On success, write the result and mark `"sent"` with the returned `meta_message_id`.
4. On failure, write the classified error and mark according to the retry table above.

If the worker crashes between steps 2 and 3, a recovery sweep (a periodic task checking for jobs stuck `"in_progress"` past a timeout) should re-check actual delivery status with Meta before blindly re-sending — to avoid double-sending a message that actually went through but whose status write never landed.

---

## 3. Monitoring & alerting this all depends on

None of the above is safe in production without visibility. At minimum, alert on:

- Quality rating drop (Medium or Low) for any active client number.
- Messaging tier unexpectedly downgraded (via the `business_capability_update` webhook or periodic polling).
- Circuit breaker tripped (aggregate error rate threshold crossed).
- `evicted_keys > 0` on the Redis broker instance (per Phase 1 — this should never happen; if it does, something regressed).
- Any error code hitting the "unrecognized code" path more than a handful of times — a real code you haven't classified yet.
- Webhook response p95 latency exceeding ~250ms.
- Dead-lettered jobs accumulating (jobs that exhausted capped retries) — these need a human review queue, not silent disappearance.

---

## Sources & note on staleness

The specific numbers above (tiers, mps, error codes, frequency caps) reflect Meta's documentation and third-party reporting as of mid-2026, and **this is an area Meta has changed multiple times in the last two years** (portfolio-level pooling introduced October 2025, 6-hour check cycles replacing 24–48h, per-message billing replacing per-conversation billing in July 2025). Before final production launch, verify current numbers directly against Meta's official developer documentation (`developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits`) rather than trusting this document indefinitely — treat every number here as "true as of when this was written," not permanent.
