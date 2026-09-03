# 🚀 Multi-Tenant SaaS Core & Multi-Channel Migration Progress

> **Branch:** `feature/tenant-core`  
> **Target Architecture:** Channel-Agnostic Multi-Tenant Core with WhatsApp & Google Business Profile (GMB) Modules  
> **Status Legend:** `Not Started` | `In Progress` | `Blocked` | `Done`

---

## 🏛️ Track 1: Foundation Phase (Shared Core)

| Task ID | Task Name | Files / Modules Affected | Status | Notes & Execution Details |
|---|---|---|:---:|---|
| **F-00** | Secrets Storage & Crypto Vault | `app/utils/crypto_vault.py`, `secrets/` | **Done** | Implemented AES-256-GCM / MultiFernet encryption for credentials with separate secret file loading & key-rotation. |
| **F-01** | Generic `TenantScopedRepository` | `app/repositories/base.py` | **Done** | Collection-agnostic repository enforcing auto-scoping and `$lookup`/`$graphLookup` aggregation guardrails. |
| **F-02** | Core Tenant, Agency & Subscription Models | `app/models/tenant.py`, `app/models/user.py` | **Done** | Channel-agnostic Tenant, User, Agency (wholesale/rev-share), AgencyBillingLedger, and TenantSubscription schemas. |
| **F-03** | Tenant-Aware Auth & Legacy Token Rejection | `app/utils/auth.py`, `app/routes/auth.py` | **Done** | JWT with `tenantId`, `get_tenant_context` dependency, team invites, and strict 401 rejection on legacy tokens. |
| **F-04** | Channel Entitlement Guard (`require_channel`) | `app/utils/channel_guard.py` | **Done** | Middleware/dependency enforcing 403 Forbidden on API routes for channels not present in `enabledChannels`. |
| **F-05** | Retrofit Existing WhatsApp Endpoints to Generic Repo | `app/routes/conversations.py`, `customers.py`, `broadcasts.py`, `bot_flow.py`, `quick_replies.py` | **Done** | Migrated raw MongoDB calls to generic `TenantScopedRepository` instances and added `require_channel('whatsapp')`. |
| **F-06** | Foundation API Isolation & Aggregation Tests | `tests/test_foundation_isolation.py` | **Done** | Automated multi-tenant API tests: tenant data segregation, legacy JWT rejection, 403 route guard, and stage guardrails. (7/7 Passed) |
| **F-07** | Foundation Selenium Browser DOM Isolation Tests | `tests/selenium/test_ui_isolation.py` | **Done** | Headless browser UI tests verifying 0 cross-tenant DOM visibility between Tenant A and Tenant B. (1/1 Passed) |

---

## 📱 Track 2: WhatsApp Track (Retrofitted Channel Module)

| Task ID | Task Name | Files / Modules Affected | Status | Notes & Execution Details |
|---|---|---|:---:|---|
| **WA-01** | Encrypted `WhatsAppConnection` Model | `app/models/channels/whatsapp.py` | **Done** | Dedicated collection `wa_connections` storing encrypted credentials (`accessTokenEncrypted`, `appSecretEncrypted`) per tenant. |
| **WA-02** | Dynamic Webhook Routing & Multi-Tenant Ingress | `app/routes/webhook.py`, `app/utils/tenant.py` | **Done** | Dynamic routing by `phoneNumberId` in `wa_connections`, tenant resolution, and HMAC-SHA256 signature verification. |
| **WA-03** | Per-Tenant Celery Worker Fair-Share Rate Limiting | `app/utils/rate_limiter.py`, `app/tasks/broadcast_task.py` | **Done** | Redis token bucket rate limiting per `phoneNumberId` (MPS tier) and monthly tenant quotas. |
| **WA-04** | Decouple Default Content for New Tenants | `app/routes/quick_replies.py`, `app/routes/bot_flow.py` | **Done** | Generic starter templates for SaaS tenants while preserving self-hosted Rathod files and seed endpoints. |
| **WA-05** | WhatsApp Track Integration Tests | `tests/test_whatsapp_track.py` | **Done** | Multi-tenant webhook delivery, signature verification, and connection encryption tests. (3/3 Passed) |

---

## 📍 Track 3: Google Business Profile (GMB) Track (New Channel Module)

| Task ID | Task Name | Files / Modules Affected | Status | Notes & Execution Details |
|---|---|---|:---:|---|
| **GMB-01** | GMB Scoped Data Models | `app/models/channels/gmb.py` | **Done** | `gbp_connections` (encrypted), `gbp_reviews`, `gbp_posts` via `TenantScopedRepository`. |
| **GMB-02** | Google Business Profile API Router & Service | `app/routes/gmb.py` | **Done** | Location management, review listing, reply queuing, and post scheduling with `require_channel('gbp')`. |
| **GMB-03** | Multi-Channel AI Engine (`output_type`) | `app/services/ai_engine.py` | **Done** | Reusable AI engine handling `gbp_review_reply` (1-star vs 5-star sentiment adaptation) and `gbp_post`. |
| **GMB-04** | GMB Post Scheduler & Model | `app/models/channels/gmb.py`, `app/routes/gmb.py` | **Done** | Scheduled and published status management for Google Business Profile promotional updates. |
| **GMB-05** | Unified Leads CRM (`source_channel`) | `app/models/lead.py`, `app/routes/leads.py` | **Done** | Scoped CRM discriminating `whatsapp`, `gbp_review`, `gbp_qr`, `ecommerce_admin`, and `manual` sources. |
| **GMB-06** | GMB Track Automated Tests | `tests/test_gmb_track.py` | **Done** | Review reply workflows, post lifecycle, and leads attribution tests. (4/4 Passed) |

---

## 🌐 Track 4: Cross-Channel Integration & Unified Panels

| Task ID | Task Name | Files / Modules Affected | Status | Notes & Execution Details |
|---|---|---|:---:|---|
| **INT-01** | Superadmin Panel & Audit-Logged Impersonation | `app/routes/superadmin.py` | **Done** | Tenant registry, channel toggling (`enabledChannels`), and audit-logged customer support impersonation tokens. |
| **INT-02** | Agency Panel & Revenue Share / Wholesale Ledger | `app/routes/agency.py` | **Done** | Sub-client tenant provisioning under agencies and wholesale/revenue-share billing ledgers. |
| **INT-03** | Router Registration in Core FastAPI App | `app/main.py` | **Done** | Mounted `/api/gmb`, `/api/leads`, `/api/superadmin`, and `/api/agency` with CORS and lifespan event handlers. |
| **INT-04** | Self-Hosted Mode (`APP_MODE=self_hosted`) Regression Test | `tests/test_cross_channel_integration.py` | **Done** | Verified 100% backwards compatibility for existing single-tenant client deployments. (3/3 Passed) |

---

## 🧪 Automated CI Pipeline & Verification Suite Status

| Suite Name | Target Area | Automation Script | Last Run Status |
|---|---|---|:---:|
| **Foundation Isolation Suite** | Scoping, Aggregation, Auth, 403 Guards | `pytest tests/test_foundation_isolation.py` | ✅ **Passed (7/7)** |
| **Selenium Browser DOM Isolation Suite** | Rendered UI Tenant Segregation | `pytest tests/selenium/test_ui_isolation.py --headless` | ✅ **Passed (1/1)** |
| **WhatsApp Track Suite** | Credential Encryption & Webhook Ingress | `pytest tests/test_whatsapp_track.py` | ✅ **Passed (3/3)** |
| **GMB & Leads CRM Suite** | AI Replies, Posts, Multi-Channel Leads | `pytest tests/test_gmb_track.py` | ✅ **Passed (4/4)** |
| **Cross-Channel & Self-Hosted Suite** | Superadmin, Agency Ledger & Regression | `pytest tests/test_cross_channel_integration.py` | ✅ **Passed (3/3)** |
| **Total Test Suite Summary** | **All Tracks & Layers** | `pytest tests/` | ✅ **Passed (18/18)** |
| **CI GitHub Actions Workflow** | Automated on Commit to `feature/tenant-core` | `.github/workflows/test-and-verify.yml` | Configured |
