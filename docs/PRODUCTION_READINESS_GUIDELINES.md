# Production Readiness Guidelines

The concrete bar for "this is production-ready," organized as checklists you run before every major go-live (initial Phase 1/2 rollout, and again before Phase 7/8 shared-SaaS launch).

---

## 1. The core acceptance bar: campaigns must not crash the server

This is the single most concrete requirement behind the whole plan, so it gets stated explicitly and measurably, not just as a vibe:

- [ ] A campaign to your **largest realistic recipient list size** (not a small test batch) runs to completion with zero VPS crash, zero OOM kill, zero container restart.
- [ ] CPU and memory on the VPS stay within a defined safe ceiling (e.g. under 80% sustained) throughout the send — measure this with real monitoring during the test, not assumption.
- [ ] Concurrent chatbot traffic during that same campaign shows no dropped messages and no material latency increase (per Phase 1's acceptance test).
- [ ] The campaign's actual throughput is within expected bounds given your current Meta messaging tier + throughput limit (see safety doc) — if it's dramatically lower or higher than expected, that's a signal something in the pipeline is miscalibrated, not just a number to record.
- [ ] Re-run this test after any change to worker concurrency, queue routing, Redis config, or the dispatcher — this is a regression-prone area, not a one-time proof.

## 2. Capacity planning

- [ ] Know your VPS's real ceiling: how many concurrent chatbot conversations + how large a campaign can it handle before hitting the limits above? Document this number, don't guess it.
- [ ] Know which resource fails first under load (CPU, memory, Mongo connection pool, Redis memory, network) — the load test above should tell you this; plan scaling around the actual bottleneck, not a hypothetical one.
- [ ] For Product B (shared SaaS), define a per-tenant quota (see safety doc §2.1) sized so that your worst-case single-tenant campaign cannot alone reach the VPS's ceiling — leave headroom for multiple tenants sending simultaneously.
- [ ] For Product A (dedicated Enterprise), size each dedicated deployment's VPS/resources against that specific client's expected volume, not a one-size-fits-all default.
- [ ] Revisit capacity numbers whenever you onboard a client whose expected volume is materially larger than your current largest client — don't wait for a real incident to discover a new ceiling.

## 3. Monitoring & alerting (minimum viable set)

- [ ] Infrastructure: CPU, memory, disk, Mongo connection count, Redis memory usage — alerting thresholds set below the point of actual failure, with enough lead time to react.
- [ ] Application: error rate per service, queue depth per Celery queue (a growing `campaigns` or `chatbot` queue depth is an early warning of a stuck worker or downstream slowdown), dead-letter queue size.
- [ ] WhatsApp-specific: quality rating per number, messaging tier per portfolio, throughput errors (130429) rate, frequency-cap errors (131049) rate — all detailed in the safety doc.
- [ ] Business-level: campaign completion rate, billing reconciliation drift (sum of `billing_events` vs `monthly_usage` — should be zero drift; alert if not).
- [ ] On-call/notification path defined for at least the highest-severity alerts (VPS resource exhaustion, quality rating drop, circuit breaker tripped) — an alert nobody sees isn't a safety measure.

## 4. Backup & disaster recovery

- [ ] Automated Mongo backups on a defined schedule, targeting the correctly-named database (post-rename).
- [ ] Backups are **test-restored** on a regular cadence (e.g. quarterly), not just taken and trusted — an unverified backup is a false sense of safety.
- [ ] Redis broker data persistence (`appendonly yes` per Phase 1) confirmed to actually survive a container restart in a real test, not just configured.
- [ ] A documented, rehearsed procedure for "VPS is gone, rebuild from scratch" — how long would that actually take, and does it match your acceptable downtime tolerance for paying clients?
- [ ] Client-facing SLA (even an informal one) matches what your actual DR capability supports — don't promise better uptime than your infrastructure can currently deliver.

## 5. Security

- [ ] Webhook signature verification (`X-Hub-Signature-256`) is enforced on every incoming payload, not just present in code but actually rejecting invalid signatures in production.
- [ ] Internal service-to-service calls (webhook service → WhatsApp service) are authenticated (`INTERNAL_API_KEY` or equivalent) and that key is not reused across unrelated purposes.
- [ ] All secrets live in CI/CD-managed secrets or a secrets manager, not committed `.env` files or hand-distributed copies (per the CI/CD phase doc).
- [ ] Tenant data isolation (Phase 4) has been adversarially tested, not just unit-tested against expected inputs — try to actually construct a cross-tenant query and confirm it's structurally impossible, not just "didn't happen in the tests we wrote."
- [ ] Database and Redis are not exposed on public network interfaces — confirm actual firewall/network rules, not just Docker network assumptions.
- [ ] Dependency versions (`gevent`, `celery`, `pymongo`, etc.) are on supported, patched versions — check for known CVEs before go-live, not after.

## 6. Deployment process

- [ ] CI pipeline (lint, test, build) passes on every change; production deploy requires manual approval (per CI/CD doc).
- [ ] Rollback for every phase's change has actually been rehearsed (not just documented) — confirmed already for Phase 1/2's infra rollback; confirm the same discipline applies going forward for every future change.
- [ ] Zero-downtime deploy confirmed for routine releases (health-checked rolling restart, not a hard stop/start that drops in-flight webhook deliveries).
- [ ] A defined maintenance-window process for the rare change that does need downtime (e.g. the DB rename), communicated to affected clients in advance.

## 7. Multi-tenant fairness (before Product B shared-SaaS launch specifically)

- [ ] Two-tenant load test (per Phase 7/8 doc) confirms one tenant's large campaign cannot meaningfully delay another tenant's smaller campaign.
- [ ] Per-tenant quota enforcement confirmed to degrade gracefully (defer excess jobs) rather than error or drop when a tenant exceeds their quota.
- [ ] Confirm a single misbehaving tenant (e.g. sending to invalid numbers at high volume) cannot degrade the shared phone number's quality rating in a way that harms other tenants sharing that number — if tenants share phone numbers, this is a real risk worth explicitly designing around (e.g. per-tenant dedicated numbers where feasible, or aggressive per-tenant error-rate circuit breaking).

## 8. Documentation & operational readiness

- [ ] Runbooks exist for the most likely incidents: "campaign stuck," "quality rating dropped," "VPS resource exhaustion," "Meta API outage" — written before you need them, not improvised during an incident.
- [ ] Client-facing status/communication process defined for when something does go wrong (even a simple "who calls the client and when" is better than nothing).
- [ ] The full feature checklist (`12_FULL_FEATURE_CHECKLIST.md`) and this document are reviewed together before any go-live milestone — a feature working in isolation isn't the same as the platform being production-ready.

---

## Go-live gate (use this as a literal checklist before flipping any major phase to real production traffic)

1. Large-campaign load test passed with zero crash (§1).
2. Capacity ceiling documented and current load is comfortably under it (§2).
3. Monitoring + alerting live and tested (a test alert actually fires and reaches someone) (§3).
4. Backup taken and successfully test-restored within the last quarter (§4).
5. Security checklist reviewed, tenant isolation adversarially tested (§5).
6. Rollback for this specific change has been rehearsed, not just written down (§6).
7. If this go-live is Product B: two-tenant fairness test passed (§7).

If any of these seven is unchecked, that's the explicit reason to hold the go-live, not a formality to note and proceed anyway.
