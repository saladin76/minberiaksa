# Communication Provider Migration — Completion Package

Status: **code migration complete → Ready for live provider QA** (not production-ready until live QA passes).

Final architecture: **WhatsApp = Meta Cloud API · Email = Brevo · SMS TR = Netgsm · SMS international = Brevo · Twilio = legacy-disabled · SendGrid = legacy-disabled.**

The single gate for every real send is `sendPreparedDelivery()` in `lib/communication/provider-router.ts`. It never uses Twilio, never silently falls back across providers, and never marks a delivery SENT without provider acceptance.

---

## Phase 1 — Active send-path audit

### 1. Routes/functions that can send WhatsApp

| Path | Provider | Uses CommunicationDelivery | Uses SentMessage | Calls lib/whatsapp.ts | Twilio | Status |
|---|---|---|---|---|---|---|
| `lib/communication/campaign-send-executor.ts` → `sendPreparedDelivery` | Meta | ✅ (before send) | — | ❌ | ❌ | Active |
| `app/api/dashboard/operations/communication/providers/whatsapp/test-template/route.ts` | Meta | ✅ (origin TEST) | — | ❌ | ❌ | Active (test) |
| `lib/communication/automatic-message-dispatcher.ts` → `sendAutomaticWhatsappMessage` | Meta | ✅ (origin TRIGGER) | ✅ mirror | ❌ | ❌ | Active (automatic) — **fixed this package** |
| `app/api/templates/whatsapp/send/route.ts` | — | — | — | ❌ (removed) | ❌ | **DISABLED 410** — fixed this package |
| `lib/whatsapp.ts` `sendBulkWhatsapp` | Twilio | — | — | (is the file) | ✅ gated | **LEGACY_DISABLED by default** — fixed this package |

### 2. Routes/functions that can send Email

| Path | Provider | Uses CommunicationDelivery | Uses SentMessage | Calls lib/email.ts | SendGrid | Status |
|---|---|---|---|---|---|---|
| `lib/communication/campaign-send-executor.ts` → `sendPreparedDelivery` | Brevo | ✅ | — | ❌ | ❌ (identity fixed) | Active |
| `app/api/dashboard/operations/communication/providers/email/test/route.ts` | Brevo | ✅ (origin TEST) | — | ❌ | ❌ | Active (test) |
| `lib/communication/automatic-message-dispatcher.ts` → `sendAutomaticEmailMessage` | Brevo | ✅ (origin TRIGGER) | ✅ mirror | ❌ | ❌ | Active (automatic) — **fixed this package** |
| `lib/communication/providers/email/client.ts` `sendEmailMessage` | Brevo (primary) | n/a (helper) | — | only via `EMAIL_LEGACY_SENDGRID_FALLBACK=true` | flag-gated | Active helper |
| `app/api/templates/email/send/route.ts` | SendGrid | ❌ | ✅ only | ✅ `sendBulkEmail` | ✅ | **LEGACY** — see remaining risks |
| `lib/email.ts` `sendBulkEmail` / `sendVerificationEmail` | SendGrid | — | — | (is the file) | ✅ | Legacy bulk + auth verification email |

### 3. Routes/functions that can send SMS

| Path | Provider routing | Uses CommunicationDelivery | Twilio | Status |
|---|---|---|---|---|
| `lib/communication/campaign-send-executor.ts` → `sendPreparedDelivery` | TR→Netgsm / intl→Brevo | ✅ | ❌ | Active — **unblocked this package** |
| `app/api/dashboard/operations/communication/providers/sms/test/route.ts` | TR→Netgsm / intl→Brevo | ✅ (origin TEST) | ❌ | Active (test) |
| `lib/communication/automatic-message-dispatcher.ts` → `sendAutomaticSmsMessage` | TR→Netgsm / intl→Brevo | ✅ (origin TRIGGER) | ❌ | Present but **unreachable** (no SMS trigger channel — `enum MessageChannel` = EMAIL\|WHATSAPP) |

### 4–9 summary

- **Use CommunicationDelivery:** campaign executor, all three provider test routes, automatic dispatcher (email/whatsapp/sms).
- **Still use SentMessage only:** `app/api/templates/email/send/route.ts` (legacy manual email). Automatic messages now write CommunicationDelivery as source-of-truth **and** a SentMessage *mirror*.
- **Still call lib/whatsapp.ts:** none active (only the disabled legacy route no longer imports it; `sendBulkWhatsapp` is legacy-disabled).
- **Still call lib/email.ts:** `app/api/templates/email/send/route.ts` (legacy) and the flag-gated fallback inside `providers/email/client.ts`.
- **Still reference Twilio:** only `lib/whatsapp.ts` (legacy-disabled) and `provider-env.ts::getLegacyTwilioConfig` (readiness label only, `active:false`).
- **Still reference SendGrid:** `lib/email.ts`, the flag-gated fallback in `providers/email/client.ts`, `app/api/templates/email/send/route.ts`, `provider-env`/`readiness` labels, and `PROVIDER_REGISTRY` (as `legacy:true, active:false`).

---

## Phase 10 — What was fixed in this package

### 1. Fixed active Twilio paths
- `lib/whatsapp.ts`: hard guard `WHATSAPP_LEGACY_TWILIO_ENABLED === "true"`. Default → no Twilio client initialized, sends nothing, returns `TWILIO_LEGACY_DISABLED` per recipient. Twilio import is now dynamic and only loaded when the flag is on.
- `app/api/templates/whatsapp/send/route.ts`: no longer imports `sendBulkWhatsapp`; returns **410** `WHATSAPP_LEGACY_ROUTE_DISABLED` with `messageAr` + `redirectTo`.

### 2. Fixed automatic messages
- New `lib/communication/automatic-message-dispatcher.ts` exposes `sendAutomaticEmailMessage`, `sendAutomaticWhatsappMessage`, `sendAutomaticSmsMessage`, plus `resolveMetaTemplateMapping`.
- `lib/events/dispatch.ts` no longer imports `sendBulkEmail`, `sendBulkWhatsapp`, or `logSentMessage`. Automatic donation confirmation/failure (and all triggers) now:
  - **Email:** Brevo via `sendPreparedDelivery`, CommunicationDelivery (origin TRIGGER) created before send.
  - **WhatsApp:** Meta via approved template; if the stored `WhatsappTemplate` has no Meta-approved mapping → delivery is **SKIPPED** `META_TEMPLATE_REQUIRED_FOR_AUTOMATIC_WHATSAPP` (never Twilio, never faked).
  - A `SentMessage` mirror is written **after** the delivery status is known (secondary, best-effort, not source of truth).

### 3. Fixed old manual template send route
- WhatsApp legacy route disabled (410) — see #1.

### 4. Fixed SMS campaigns
- `campaign-send-planner.ts`: removed the global `SMS_SEND_NOT_IMPLEMENTED` block. SMS readiness is now per-recipient routed: TR→Netgsm, international→Brevo. Missing provider → `NETGSM_NOT_CONFIGURED` / `BREVO_SMS_NOT_CONFIGURED`; both missing on a mixed audience → `SMS_PROVIDER_NOT_CONFIGURED` (reasons map shows both, with counts). No `phoneNumberId` required for SMS.
- `campaign-send-executor.ts`: SMS sender identity is env-based (Netgsm header / Brevo SMS sender); a `CommunicationSender` row is optional — SMS no longer skips as `NO_SENDER_AVAILABLE` when env is configured.

### 5. Fixed SendGrid/SENDGRID_FROM fallback
- `campaign-send-planner.ts` + `campaign-send-executor.ts`: email identity order is now **enabled EMAIL sender email → `BREVO_EMAIL_SENDER_EMAIL` → (legacy `SENDGRID_FROM` only when `EMAIL_LEGACY_SENDGRID_FALLBACK=true`)**. `SENDGRID_FROM` is never a normal identity.

### 6. Fixed provider registry duplication
- `lib/communication/provider-registry.ts`: `PROVIDER_REGISTRY` is the single source of truth. `communicationProviderRegistry` is now a **derived compatibility export** (Meta / Brevo Email / Brevo SMS only). The `SMS_FALLBACK` pseudo-provider was removed as an active provider. Twilio + SendGrid appear only as `legacy:true, active:false`. UI reads `activeProviders()` / `legacyProviders()` / `OFFICIAL_PROVIDER_MATRIX`.

### 7. Fixed Brevo webhook production security
- `app/api/webhooks/brevo/transactional/route.ts`: **fail-closed in production** — if `BREVO_SMS_WEBHOOK_SECRET` is missing and `NODE_ENV=production`, returns 401 and does **no** processing / no DB write. If the secret is set, the `?token=` must match. It only advances an existing delivery by `providerMessageId` — never creates or fakes a SENT.

### 8. Remaining legacy files and why they are safe
- `lib/whatsapp.ts` — legacy-disabled by default; only sends when `WHATSAPP_LEGACY_TWILIO_ENABLED=true` (emergency/manual only). No active route depends on it.
- `lib/email.ts` — SendGrid bulk + **auth verification email** (`sendVerificationEmail`, used by signup/verify flow, out of Communication-Center scope). Still used by the legacy `app/api/templates/email/send/route.ts` and the flag-gated Brevo-client fallback.
- `app/api/templates/email/send/route.ts` — legacy manual email send from the old `/dashboard/templates` page; still SendGrid + SentMessage-only. **Not Twilio.** Not migrated in this package (out of the required scope, which named only the WhatsApp route). Safe because: it is gated by `SENDGRID_API_KEY` presence, never marks fake success, and is superseded by the Communication Center campaign + email-test flows. Recommended follow-up: disable/migrate identically to the WhatsApp route.
- `provider-env.ts::getLegacyTwilioConfig` — returns `active:false`; readiness label only.

### 9. Live QA checklist
1. **Twilio off:** set `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` but NOT `WHATSAPP_LEGACY_TWILIO_ENABLED`. Fire a WhatsApp trigger → delivery SKIPPED `META_TEMPLATE_REQUIRED_FOR_AUTOMATIC_WHATSAPP` (or SENT if a Meta template exists). Confirm **nothing** goes through Twilio and `/api/templates/whatsapp/send` returns 410.
2. **Automatic email (Brevo):** configure `BREVO_API_KEY` + `BREVO_EMAIL_SENDER_EMAIL`, enable a DONATION_PAID email trigger, make a test donation → CommunicationDelivery (origin TRIGGER) SENT with a Brevo `providerMessageId`; a mirror SentMessage row exists.
3. **Automatic WhatsApp:** with a genuinely Meta-approved template (provider META, approvalStatus approved) → SENT; without one → SKIPPED with the documented reason. Never Twilio.
4. **SMS campaign TR:** Turkish recipients + Netgsm env → campaign sends via Netgsm; delivery SENT. Without Netgsm → blocked `NETGSM_NOT_CONFIGURED`.
5. **SMS campaign international:** non-TR recipients + Brevo SMS env → sends via Brevo. Without it → blocked `BREVO_SMS_NOT_CONFIGURED`. Mixed audience missing both → `SMS_PROVIDER_NOT_CONFIGURED` (reasons show both).
6. **Email identity:** confirm campaigns/automatic email use the enabled EMAIL sender or `BREVO_EMAIL_SENDER_EMAIL`, never `SENDGRID_FROM` (unless `EMAIL_LEGACY_SENDGRID_FALLBACK=true`).
7. **Brevo webhook:** production without `BREVO_SMS_WEBHOOK_SECRET` → 401, no DB change. With secret + correct `?token=` → an existing delivery advances to DELIVERED/OPENED/etc.; never creates a SENT.
8. **Provider registry UI:** operations/messaging + platform-connections show Meta / Brevo Email / Brevo SMS / Netgsm as active; Twilio + SendGrid only under legacy; no `SMS_FALLBACK`.
