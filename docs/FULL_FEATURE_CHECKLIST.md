# Full Feature Checklist — What Should Be Working After the Complete Migration

This is the target-state definition for the whole plan (Phases 1–8). Use it as the master acceptance checklist — not a to-do list for one sprint, but "if any of this isn't true, the platform isn't actually done," regardless of which phase document technically covers it. Organize your own sprint/phase tracking against this, and re-check it before calling the migration complete.

---

## 1. Messaging Core (Webhook + Send Path)

- [ ] Inbound messages (text, interactive, button, media) are received, signature-verified (`X-Hub-Signature-256`), persisted to `incoming_messages`, and acknowledged to Meta in well under 250ms median — slow webhook responses risk Meta treating the endpoint as failing and retrying/backing off.
- [ ] Outbound messages (template + free-form session replies) are sent, tracked through `sent → delivered → read/failed` status via delivery-receipt webhooks, with idempotent status writes (duplicate webhook delivery does not double-count or double-bill).
- [ ] The 24-hour customer service window is tracked accurately per contact, and the system correctly distinguishes free-form-eligible windows from template-required windows.
- [ ] Media messages (image/document/audio/video) are received and can be sent, including any file-size/type validation Meta requires.
- [ ] Contact/profile metadata (name, unread count, last-active) stays in sync with actual conversation activity.

## 2. Campaign Engine

- [ ] Campaigns can be created against a defined audience/segment, with recipient lists deduplicated before dispatch.
- [ ] Campaign job creation and dispatch are batched (not one-row/one-task per recipient) and complete without server crash or memory exhaustion at realistic list sizes (10,000+ recipients).
- [ ] Campaigns respect **both** Meta's account-level throughput limit and your own configured/tenant-level rate limit — whichever is lower governs actual send speed (see `12_SAFETY_RATE_LIMITING_RETRY.md`).
- [ ] Campaigns can be paused, resumed, and cancelled mid-flight without losing track of which recipients were already sent to (no duplicate sends on resume).
- [ ] Failed sends are retried according to the classified error type (permanent vs. transient vs. rate-limited) — not retried blindly, and not silently dropped.
- [ ] Campaign progress (sent/delivered/read/failed counts) is visible in near-real-time, not only after full completion.
- [ ] A campaign that hits Meta's daily messaging-tier ceiling mid-send degrades gracefully (queues the remainder, surfaces a clear status) rather than crashing or silently failing sends.

## 3. Chatbot / Conversational Flows

- [ ] All client conversation flows run on the generic config-driven flow engine; per-client custom Python exists only for the two genuinely bespoke plugin behaviors (restaurant capacity, banquet urgency-flagging), not for the conversation logic itself.
- [ ] A brand-new client can be onboarded with a flow config file and zero new backend code.
- [ ] Concurrent chatbot conversations remain responsive (no perceptible added latency) even while a large campaign is dispatching in parallel.
- [ ] Session state (current step, collected data) survives a worker restart / redeploy without losing the customer's place in the conversation.
- [ ] Language selection and multi-language prompts work per the configured flow (where applicable).
- [ ] Feedback/rating flows (`nfm_reply` interactive responses) and free-text feedback-keyword detection both route correctly.
- [ ] A stalled/abandoned conversation (customer goes quiet mid-flow) is handled predictably — either an inactivity reminder, a timeout back to a default state, or an explicit "conversation expired" behavior, not an indefinitely stuck session.

## 4. Multi-Tenancy & Data Isolation

- [ ] Every tenant-scoped collection query is structurally required to declare a `business_id` up front (via `TenantScopedRepository` or equivalent) — there is no code path that can query tenant data without an explicit, externally-supplied tenant identity.
- [ ] Anything intentionally shared/global across tenants (if any) is explicitly flagged as such, not "global by omission."
- [ ] Cross-tenant data leakage is verifiably impossible: a query built for Tenant A cannot return Tenant B's messages, campaigns, contacts, or billing records under any input.
- [ ] Tenant-level resource usage (message volume, campaign concurrency) cannot starve another tenant sharing the same infrastructure (Product B / shared SaaS tier).

## 5. Billing & Cost Tracking

- [ ] Every billable outbound message is logged exactly once in `billing_events`, keyed by `meta_message_id` for idempotency (a duplicated status webhook must not create a duplicate billing row).
- [ ] Billing correctly distinguishes category (marketing/utility/authentication/service) and applies the right rate; free-window (service) messages are logged with `free_reason` and not charged.
- [ ] Monthly usage rollups (`monthly_usage` or equivalent) reconcile against the sum of `billing_events` for that client and month — no drift between the two.
- [ ] Billing pricing is not hardcoded per call site — it lives in one pricing table/config, matching the actual current Meta rate card for the categories and countries you operate in (see safety doc — Meta's rates and billing model have changed multiple times; don't let a hardcoded 2025 rate card silently go stale).

## 6. Reliability & Error Handling

- [ ] Every Meta API error code your system can receive is classified exactly once, in one shared location, into a clear action (skip/retry-short/retry-long), with that classification covering the actual error codes Meta returns in production (not just the four documented ones — see safety doc for the fuller list you should handle).
- [ ] Idempotency is enforced on every webhook-triggered write: replaying the same `webhook_events`/status payload twice must be a no-op the second time.
- [ ] A worker crash mid-task does not leave a campaign/message/session in a permanently ambiguous state — task acknowledgment and DB state updates are ordered so a retry after crash is safe (see safety doc for the exact ordering pattern).

## 7. Infrastructure & Ops

- [ ] The platform survives a large campaign send without VPS crash, memory exhaustion, or dropped chatbot messages (this is the literal, measurable acceptance bar for the whole Phase 1 effort — verify it under real production-scale load, not just a staging mock).
- [ ] Redis, MongoDB, and Celery all have working health checks, and container restart policies bring the stack back automatically after a transient failure.
- [ ] Backups (Mongo dump/restore) run on a schedule, target the correctly-named database, and have been test-restored at least once (a backup that's never been restored isn't verified).
- [ ] CI blocks merges on failing tests; production deploys require manual approval; no direct commits to `main`.
- [ ] Secrets (`META_ACCESS_TOKEN`, `INTERNAL_API_KEY`, DB credentials) are managed through CI/CD secrets, not hand-distributed `.env` files.


## 9. Frontend / Dashboard

- [ ] Campaign creation, monitoring (live status, job counts), and pause/cancel controls are available and functional.
- [ ] Template/message-category management is available.
- [ ] Business/tenant settings are editable through the dashboard, scoped correctly per tenant.
- [ ] (If migrated) the chatbot flow config has a usable editor, not just raw JSON hand-editing, for non-developer staff to adjust client flows.

## 10. Compliance & Platform Policy Alignment

- [ ] Marketing template sends respect Meta's frequency-capping reality (a user can only receive a small number of marketing messages per day across all businesses — sending more than the user's tolerance risks messages being silently suppressed, not delivered and ignored) — see safety doc.
- [ ] The system tracks and reacts to phone number **quality rating** (High/Medium/Low), since a sustained Low rating triggers automatic tier downgrades — a production dashboard should surface this, not just discover it when campaigns start failing.
- [ ] If sending to US numbers, marketing template restrictions currently in effect are respected (confirm current Meta policy before launch, since this is a live policy area — see safety doc's note on checking for updates).
