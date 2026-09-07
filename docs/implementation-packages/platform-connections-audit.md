# Platform Connections & Sending — Audit (Package 1)

**Section being planned:** «ربط المنصات والإرسال» (Platform Connections & Sending)
**Type:** Audit + planning only. One minimal, behavior-neutral build fix applied (see §11).
**Date:** 2026-07-07

> Guardrails honored: no tracking/pixel/CAPI/ads dispatch logic changed; no provider send logic
> changed; no donation/payment flow changed; no routes moved or deleted; no legacy pages removed;
> no schema change; no secrets exposed; no demo/seed/placeholder data added.

This document maps **what already exists**. The target section is a *navigation + readiness + test*
surface over systems that are **already implemented** in three different places today:

1. **Tracking / Pixels** — `lib/tracking/**`, `TrackingSettings` model, `components/TrackingPixels.tsx`.
2. **Ad-account / platform connections** — `lib/marketing/**`, `MarketingPlatformConnection` model,
   `/dashboard/marketing/connections`.
3. **Communication providers** — `lib/communication/**`, `CommunicationSender` / `SenderRoutingRule` /
   `CommunicationDelivery` / `CommunicationProviderEvent` models, `/dashboard/operations/communication/**`.

The new section should **link into / surface** these, not rebuild them.

---

## 1. Current routes and what they do

### 1a. Tracking / Pixels (dashboard)
| Route | Purpose | Legacy? |
|---|---|---|
| `/dashboard/pixels` | Pixel/tracking readiness UI (reads `TrackingSettings`) | current |
| `/dashboard/conversion-events` | Conversion-event review (backed by AuditLog + Donation, **no dedicated table**) | current |
| `/dashboard/ads` | Ads diagnostics (`_components/DiagnosticsTab.tsx`, `DiagnosticsDrawer.tsx`) | current |
| `/dashboard/marketing/tracking-hub` | Tracking hub overview | current |
| `/dashboard/marketing-intelligence/attribution-verification` | Attribution/dedup verification | current |
| `/dashboard/marketing-intelligence/platform-status` | Platform readiness status | current |

### 1b. Ad-account / platform connections (dashboard)
| Route | Purpose |
|---|---|
| `/dashboard/marketing/connections` | **Primary** platform-connection manager (`ConnectionsPageClient.tsx`, `ConnectionDrawer.tsx`) over `MarketingPlatformConnection` |
| `/dashboard/marketing/connections/catalog` | Provider catalog (available platforms) |
| `/dashboard/marketing/connections/health` | Connection health overview |
| `/dashboard/marketing/command-center` | Marketing decision center (reads connections + provider health) |
| `/dashboard/marketing/data-sync`, `/sync-log` | Platform sync trigger + sync history (`PlatformSyncRun`) |
| `/dashboard/marketing/google-ads`, `/results`, `/insights`, `/quality`, `/recommendations` | Ads data views over `AdCampaignSnapshot` / `AdGroupSnapshot` |
| `/dashboard/marketing-intelligence/**` | ~30 marketing-intelligence sub-pages (platform-metrics, platform-sync, reconciliation, budget, meta-sync, repair-center, …) — heavy overlap; **candidate to consolidate/link, not move wholesale** |

### 1c. Communication providers (dashboard)
| Route | Purpose |
|---|---|
| `/dashboard/operations/communication` | Communication Center overview |
| `.../communication/settings` | Provider readiness checklist + **provider test tools** + webhook status |
| `.../communication/senders` | WhatsApp numbers / email senders / SMS senders (`CommunicationSender`) |
| `.../communication/routing` | Sender routing rules (`SenderRoutingRule`) |
| `.../communication/provider-events` | Provider webhook events (`CommunicationProviderEvent`) |
| `.../communication/delivery-logs` | Delivery archive (`CommunicationDelivery`) |
| `.../communication/providers` | Provider readiness API-backed view |
| `.../communication/campaigns` `[id]`, `/inbox`, `/audiences`, `/templates`, `/reports`, `/flows`, `/preferences` | Campaign builder, inbox, audiences, templates, reports, transactional flows, contact prefs |

### 1d. Legacy pages (keep — do not delete)
| Route | Status |
|---|---|
| `/dashboard/messages` | Legacy messaging (`Message`, `SentMessage`, `MessageTrigger`) — superseded by Communication Center but retained |
| `/dashboard/templates` | Legacy templates (`EmailTemplate`, `WhatsappTemplate`) — retained |
| `/dashboard/telegram` | Telegram bot integration (separate) |

### 1e. Relevant API routes (do not move in this package)
- Tracking dispatch: `app/api/track/route.ts`, `app/api/tracking/facebook-capi/route.ts`,
  `app/api/donations/[id]/track-conversion/route.ts`, `app/api/donations/[id]/fail/route.ts`,
  `app/api/admin/tracking/test/route.ts`, `app/api/admin/conversion-events/retry/route.ts`.
- Donation → conversion triggers: `app/api/stripe/webhook/route.ts`, `app/api/payfor/3dpay/ok|fail/route.ts`.
- Connections: `app/api/admin/marketing-platform-connections/**` (list, `[id]`, `enable`, `disable`,
  `sync`, `test`, `apply-to-pixels`, `health`), `app/api/admin/marketing-platform-sync/**`.
- Communication: `app/api/dashboard/operations/communication/**` (senders, routing, delivery-logs,
  provider-events, providers, campaigns `send`/`schedule`/`run-due`, provider test tools under
  `providers/whatsapp/{health,test-template}`, `providers/email/test`).
- Webhooks: `app/api/webhooks/meta/whatsapp/route.ts` (verify token GET + signed POST).
- Cron: `app/api/cron/communication-run-due/route.ts` (fail-closed `CRON_SECRET`).

---

## 2. Current services and provider adapters

### 2a. Tracking (`lib/tracking/**`) — **DO NOT MODIFY**
| File | Role |
|---|---|
| `donation-conversion-server.ts` | Server-side donation→conversion dispatch orchestrator |
| `meta-capi.ts` | Meta Conversions API payload builder + sender |
| `browser-conversions.ts` | Browser-side event dispatch helpers |
| `stable-event-id.ts` | Deterministic `event_id` for browser↔server **deduplication** |
| `conversion-audit.ts`, `conversion-event-log.ts`, `conversion-event-indexes.ts` | Conversion logging (persists to **`AuditLog`** + flags on **`Donation`**; no dedicated table) |
| `conversion-retry-truth.ts`, `conversion-timeline-service.ts` | Retry truth + timeline |
| `attribution-resolver.ts`, `canonical.ts`, `click-id-storage.ts`, `data-quality-score.ts` | Attribution / click-id / quality |
| `tracking-settings.ts` | Reads/writes `TrackingSettings` (single-record) |
| `tracking-event-contract.ts` | Event name/shape contract (source of truth for event names) |
| `platform-diagnostics.ts` | Pixel/CAPI diagnostics |
| Components: `components/TrackingPixels.tsx`, `components/DeferredGTM.tsx`, `components/SuccessFinalConversionTracker.tsx`, `lib/events/dispatch.ts`, `lib/analytics.ts` | Script loading + client dispatch |

### 2b. Marketing / ad connections (`lib/marketing/**`)
| File | Role |
|---|---|
| `integrations/provider-catalog.ts`, `provider-types.ts`, `platform-capabilities.ts`, `platform-connection-requirements.ts` | Provider catalog + capability + required-field definitions |
| `integrations/provider-service.ts`, `provider-connection-adapter.ts`, `connection-serializer.ts` | CRUD + serialize `MarketingPlatformConnection` (masked in GET) |
| `integrations/provider-health-service.ts`, `provider-health.ts` | Connection readiness/health |
| `secrets.ts` | **Secret masking + redaction** (`SECRET_FIELDS`, `maskSecret`, `applySecretField`, `redactSecretsFromMetadata`) — **no at-rest encryption** (see §8) |
| `sync/{index,meta,google-ads,ga4,tiktok,x,twilio,types}.ts`, `google-ads-*.ts` | Per-platform read-only sync → `PlatformSyncRun` + `AdCampaignSnapshot`/`AdGroupSnapshot` |
| `command-center/command-center-service.ts`, `results/**`, `reconciliation*.ts`, `marketing-recommendations.ts` | Decision center, results, reconciliation |

### 2c. Communication (`lib/communication/**`)
| File | Role |
|---|---|
| `provider-router.ts` | `resolveProviderForSend`, `sendPreparedDelivery`, `isSendEnabled` — routes to adapters |
| `providers/meta-whatsapp/{client,messages,webhooks}.ts` | WhatsApp Cloud API adapter + health + webhook parse/verify |
| `providers/email/client.ts` (SendGrid) | Email adapter |
| SMS | **not implemented** — router returns `SMS_SEND_NOT_IMPLEMENTED` |
| `sender-service.ts`, `sender-router.ts`, `routing-rule-service.ts` | Senders + routing resolution |
| `delivery-log-service.ts` | Delivery archive; **never-fake-SENT** guard (needs `providerMessageId` or `internalAccepted`) |
| `webhook-service.ts` | Idempotent inbound/status event processing |
| `campaign-send-executor.ts`, `campaign-send-planner.ts` | Safe send gates, `computeFinalStatus` |
| `scheduler-status.ts` | Cron readiness |

---

## 3. Current environment variables used

> Names only — **no values**. Grouped by system.

### 3a. Communication providers (env-only today)
- **Meta WhatsApp:** `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_APP_SECRET`,
  `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `META_WHATSAPP_BUSINESS_ACCOUNT_ID`,
  `META_WHATSAPP_PHONE_NUMBER_ID`, `META_GRAPH_VERSION`.
- **Email (SendGrid):** `SENDGRID_API_KEY`, `SENDGRID_FROM`.
- **SMS (Twilio, adapter not wired):** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
  `TWILIO_MESSAGING_SERVICE_SID`, `TWILIO_SMS_FROM`.
- **SMS (Netgsm, adapter not wired):** `NETGSM_USERCODE`, `NETGSM_PASSWORD`, `NETGSM_APIKEY`.
- **Cron:** `CRON_SECRET` (fail-closed scheduler).

### 3b. Tracking / pixels (primary config is **DB**, env are fallbacks)
- `META_PIXEL_ID`, `META_ACCESS_TOKEN` (Meta Pixel/CAPI fallback), `GA4_MEASUREMENT_ID`,
  `GA4_API_SECRET`.
- Primary values live in **`TrackingSettings`** (DB): `facebookPixelId`, `facebookAccessToken`,
  `gaMeasurementId`, `tiktokPixelId`, `tiktokAccessToken`, `googleAdsConversionId`,
  `googleAdsConversionLabel`, `xPixelId`.

### 3c. Ad-account connections (primary config is **DB** = `MarketingPlatformConnection`)
- Non-secret identifiers stored as columns (`accountId`, `pixelId`, `datasetId`, `conversionId`,
  `advertiserId`, `propertyId`, `streamId`, `managerAccountId`, …).
- Secrets stored as columns: `accessToken`, `refreshToken`, `authToken`, `appSecret`,
  `clientSecret`, `developerToken`, `apiSecret` — **plaintext at rest** (see §8).

### 3d. Other
- `OPENAI_API_KEY` (marketing AI assistant, server-only), `DATABASE_URL`, `NODE_ENV`,
  `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_URL`, Supabase `NEXT_PUBLIC_SUPABASE_*` (storage).

---

## 4. What can be safely moved (surfaced) into the new section

The new «ربط المنصات والإرسال» section should be a **thin navigation + readiness + test hub** that
**links to** existing pages (or embeds their read-only overviews). No underlying service/model moves.

| New section item | Backed by (existing) | Move strategy |
|---|---|---|
| 1. Overview | aggregate of readiness across all three systems | New read-only overview page; links out |
| 2. Tracking Pixels | `/dashboard/pixels`, `TrackingSettings`, `lib/tracking` | **Link/surface** readiness; keep dispatch untouched |
| 3. Ad Accounts | `/dashboard/marketing/connections`, `MarketingPlatformConnection` | **Link/surface**; connections manager stays |
| 4. Communication Providers | `.../communication/settings` + `providers` | **Link/surface** readiness + test tools |
| 5. WhatsApp Numbers | `.../communication/senders` (channel WHATSAPP) | **Link** |
| 6. Email Providers | `.../communication/senders` (channel EMAIL) + SendGrid readiness | **Link** |
| 7. SMS Providers | senders (channel SMS) + "not implemented" status | **Link** (honest "غير مفعّل بعد") |
| 8. Webhooks | `/api/webhooks/meta/whatsapp` status in settings | **Surface** URL + signature/last-event status |
| 9. Connection Tests | existing test endpoints (`providers/*/test`, connections `[id]/test`) | **Reuse** endpoints; no new send logic |
| 10. Advanced Logs | `delivery-logs`, `provider-events`, `sync-log`, conversion log | **Link** to advanced pages |

Safe to move **now**: none of the *code* — only **navigation/entry points** and **read-only readiness
summaries**. Everything else is a link.

---

## 5. What must remain in place for backward compatibility

- **All tracking dispatch** (`lib/tracking/**`, `components/TrackingPixels.tsx`, `DeferredGTM.tsx`,
  `SuccessFinalConversionTracker.tsx`, `/api/track`, `/api/tracking/facebook-capi`, donation triggers).
  Event names, `event_id` dedup, CAPI payload shape, script-load timing — **frozen**.
- **All donation/payment triggers** (`/api/stripe/webhook`, `/api/payfor/3dpay/*`).
- **All communication send logic** (`campaign-send-executor`, `provider-router`, adapters, webhook-service).
- **All existing routes** remain reachable (legacy `/dashboard/messages`, `/dashboard/templates`,
  and every `marketing-intelligence/**` page) — the new section adds entry points, does not replace.
- **Model shapes** (`TrackingSettings`, `MarketingPlatformConnection`, communication models) — unchanged.

---

## 6. Which old pages should redirect / hide / link

**Recommendation for later packages (NOT this one):**
- **Link (keep as-is):** `/dashboard/pixels`, `/dashboard/marketing/connections`,
  `.../communication/settings|senders|routing|provider-events|delivery-logs`. The new hub links to them.
- **Consolidate later (candidate):** the ~30 `/dashboard/marketing-intelligence/**` pages overlap heavily
  with `/dashboard/marketing/**`. Propose grouping under the new section's "Advanced Logs / Ad Accounts"
  rather than redirecting yet (redirects risk breaking bookmarks/links in this audit phase).
- **Do not redirect/hide anything in Package 1.** Redirects belong to a later "navigation" package after
  the hub exists.
- **Legacy `/dashboard/messages`, `/dashboard/templates`:** keep; add a "superseded by Communication
  Center" link later, do not redirect.

---

## 7. Pixel safety risks

**Confirmed safe — nothing changed in this package.** Strict rules upheld:
- Event names, event IDs, deduplication (`stable-event-id.ts`), donation trigger logic, CAPI payload
  shape (`meta-capi.ts`), script loading (`TrackingPixels.tsx` / `DeferredGTM.tsx`) and timing — all
  untouched. Provider keys not renamed. Production env expectations unchanged.

**Risks to watch in future packages (do NOT trip these):**
1. `TrackingSettings` is a **single-record** legacy store; `MarketingPlatformConnection` is the
   multi-account store. A future "apply connection → pixels" action already exists
   (`marketing-platform-connections/[id]/apply-to-pixels`). Any new hub must call that **existing**
   path — never write pixel IDs by a new code path (would risk drift in dedup/attribution).
2. Server CAPI token (`TrackingSettings.facebookAccessToken`, env `META_ACCESS_TOKEN`) must stay
   **server-only**. The new UI must show readiness booleans, never the token.
3. Do not add the new hub's readiness checks *inside* the dispatch path — keep readiness read-only and
   out of the hot conversion path so timing is unaffected.

---

## 8. Communication + connection provider safety risks

1. **Secrets at rest are NOT encrypted.** `MarketingPlatformConnection` stores `accessToken`,
   `refreshToken`, `authToken`, `appSecret`, `clientSecret`, `developerToken`, `apiSecret` as
   **plaintext columns**. `lib/marketing/secrets.ts` masks them on GET and redacts them from audit
   logs, and its header explicitly states *"No encryption is applied here — at-rest encryption can be
   layered later."* The connections UI already shows the honest note *"التشفير داخل قاعدة البيانات غير
   مفعّل بعد"*.
   → **The new section must NOT introduce any new secret-storage UI until at-rest encryption exists.**
   For providers configured via **env only** (WhatsApp, SendGrid, Twilio, Netgsm), the hub can show
   **readiness + setup instructions**, but must **not** offer to store those secrets in the DB.
2. **Never-fake-SENT** invariant lives in `delivery-log-service.markDeliveryStatus` — any new "test"
   surface must reuse existing test endpoints, never mark SENT directly.
3. **Webhook signature** is enforced (`verifyWebhookSignature`); production rejects unconfigured
   secret. The hub must only *display* webhook status, not weaken verification.
4. **SMS is intentionally not implemented** (`SMS_SEND_NOT_IMPLEMENTED`). The hub must show "غير مفعّل
   بعد" and not imply sending works.
5. **Send auth + confirm:** all send/test endpoints require an operations session and `confirm:true`.
   New test buttons must keep both.

---

## 9. Required permissions

- All connection/communication/tracking mutations already sit behind **admin/operations** auth
  (`requireOperationsApiSession` for communication; admin guards for
  `app/api/admin/marketing-platform-connections/**` and `app/api/admin/tracking/**`).
- The new section is **admin/operations-only**. Recommended dashboard permission keys (reuse existing
  RBAC, do not invent new gating in Package 1):
  - Tracking/Pixels & Ad Accounts → marketing/admin permission (same as `/dashboard/marketing/**`).
  - Communication Providers/WhatsApp/Email/SMS/Webhooks/Tests/Logs → operations permission (same as
    `/dashboard/operations/communication/**`).
- Cron endpoints stay **fail-closed** on `CRON_SECRET`.

---

## 10. Proposed implementation packages (sequenced)

- **Package 1 (this):** Audit + planning. ✅ (plus one behavior-neutral build fix, §11.)
- **Package 2 — Section scaffold + Overview:** Create «ربط المنصات والإرسال» route group with a
  read-only Overview that aggregates readiness from the three existing systems (all data via existing
  services). Links only; no new mutations.
- **Package 3 — Tracking Pixels & Ad Accounts tabs:** Embed existing readiness/health (from
  `TrackingSettings` + `MarketingPlatformConnection` serializers). Read-only + links to existing
  managers. No dispatch/secret changes.
- **Package 4 — Communication Providers / WhatsApp / Email / SMS tabs:** Surface `senders` + provider
  readiness + reuse existing **test** endpoints. Honest "not implemented" for SMS.
- **Package 5 — Webhooks & Connection Tests:** Surface webhook status + wire the existing test buttons
  into the hub (reuse endpoints; keep auth + confirm).
- **Package 6 — Advanced Logs:** Link/embed `delivery-logs`, `provider-events`, `sync-log`, conversion
  log.
- **Package 7 — Navigation cleanup:** *Only after the hub exists* — redirect/link legacy and overlapping
  `marketing-intelligence/**` pages into the hub.
- **Package 8 (prerequisite for any DB secret entry) — At-rest encryption** for
  `MarketingPlatformConnection` secret fields, before the hub ever offers to store a secret.

---

## 11. Minimal safe fix applied in this package

**Problem discovered while running `npm run build`:** the build **compiled successfully** but then
**failed at static export** — three live-data admin pages exceeded Next's 60-second per-page prerender
timeout (×3 retries → `next build` exit 1):
`/dashboard/system-overview`, `/dashboard/marketing/command-center`,
`/dashboard/executive/system-overview`. None declared a rendering mode, so Next attempted to statically
prerender pages that do heavy per-request Prisma aggregation.

**Fix (behavior-neutral):** added `export const dynamic = "force-dynamic";` to those three page files
only. These are auth-gated admin dashboards that already render per request in production; forcing
dynamic simply removes them from build-time static export. **No** tracking/pixel/CAPI/ads/payment/send/
route/schema behavior is affected. This is the "minimal safe fix if needed" the package allows, and is
required to satisfy the "Build passes" acceptance criterion.

---

## Acceptance checklist
- [x] Audit doc exists (this file).
- [x] No runtime behavior changed (only render-mode directive on 3 admin pages).
- [x] No pixel/tracking logic changed.
- [x] No provider send logic changed.
- [x] No routes deleted / no legacy pages removed.
- [x] Build passes (after the §11 fix — see final response for the confirming run).
- [x] Next implementation plan is clear (§10).
