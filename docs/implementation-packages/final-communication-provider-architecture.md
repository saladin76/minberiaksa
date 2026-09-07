# Final Communication Provider Architecture — Audit + Implementation

Date: 2026-07-08. Backend provider architecture finalized. **Not production-verified** — live provider
credentials (Meta / Brevo / Netgsm) were not exercised; see live-QA sections.

## Final provider matrix
| Channel | Active | Legacy/disabled |
|---|---|---|
| WhatsApp | **Meta WhatsApp** (`META_WHATSAPP`) | Twilio |
| Email | **Brevo Email** (`BREVO_EMAIL`) | SendGrid (flag-gated fallback only) |
| SMS int'l | **Brevo SMS** (`BREVO_SMS`) | Twilio |
| SMS Turkey (+90/TR) | **Netgsm** (`NETGSM_SMS`) | Twilio |

## PART 1 — Audit findings

### Twilio references + disposition
- `lib/communication/providers/sms/client.ts` — **rewritten**: Twilio removed from the active SMS path
  (now Netgsm/Brevo only, no fallback).
- `lib/communication/provider-router.ts` — **rewritten**: no Twilio anywhere.
- `lib/whatsapp.ts`, `lib/messaging/twilio-templates.ts`, `lib/messaging/twilio-tracking-url.ts` —
  **legacy, untouched** (not called by the new ProviderRouter; kept for migration reference).
- `lib/marketing/sync/twilio.ts`, marketing `provider-catalog/health/platform-*`, connections pages —
  **unrelated** (Twilio as an *ad-analytics/marketing-platform connection*, not a send provider).
- `sender-service.ts` / `sender-router.ts` / `communication-runtime-types.ts` still list `TWILIO` as a
  provider **enum value** for legacy/back-compat rows — kept, but never selected by active routing.
- UI mentions (`settings/senders/provider-events` pages) — the outdated "Twilio للدولي" SMS note was
  **replaced** with the final matrix; Twilio now shown only under a "قديم (غير مستخدم)" line.

### SendGrid references + disposition
- `lib/email.ts` — **legacy, untouched** (SendGrid transport).
- `lib/communication/providers/email/client.ts` — **rewritten**: Brevo is primary; SendGrid only runs
  when `EMAIL_LEGACY_SENDGRID_FALLBACK=true` **and** Brevo is unconfigured. Never primary.
- `provider-router.ts` email branch → `BREVO_EMAIL` (was `SENDGRID`).
- `campaign-send-executor.ts` / `campaign-send-planner.ts` reference `SENDGRID_FROM` only as a legacy
  email-identity fallback — harmless; Brevo sender is preferred.
- `platform-connection-requirements.ts` / `platform-connections/readiness.ts` — marketing readiness
  metadata; not the send path.

### Meta WhatsApp files (present, complete)
`providers/meta-whatsapp/{client,messages,webhooks,errors,templates,types}.ts` — send approved
templates, health check, webhook verify + signature, sanitized payloads, delivery status updates,
inbound `CommunicationProviderEvent` with `senderId`.

### Brevo files — **added** this package
`providers/brevo/{email-client,sms-client,types,errors}.ts`.

### Netgsm files — **added** this package
`providers/netgsm/{client,types,errors}.ts`.

### Active send routes
- WhatsApp: `providers/whatsapp/{health,test-template}` + campaign executor → Meta.
- Email: `providers/email/test` + campaign executor → Brevo.
- SMS: `providers/sms/test` (**new**) + campaign executor → Netgsm/Brevo by country.

### Legacy `SentMessage`-only routes (documented, NOT migrated here)
- `app/api/templates/email/send/route.ts`, `app/api/templates/whatsapp/send/route.ts` — legacy template
  sends writing `SentMessage`. Not called by the Communication Center; **remain legacy** (see TODO).
- `lib/events/dispatch.ts` + automatic donation/confirmation notifications — **remain legacy** (TODO).

### Routes already using `CommunicationDelivery`
Campaign executor, all provider test tools (whatsapp/email/sms), delivery-log-service.

### Env vars — current vs required (see below).

## PART 2–13 — Implementation summary
- **Registry** (`provider-registry.ts`): added `PROVIDER_REGISTRY` + helpers (active/legacy/byKey/matrix).
- **Env** (`provider-env.ts`): `getMetaWhatsappConfig/getBrevoEmailConfig/getBrevoSmsConfig/getNetgsmSmsConfig/getLegacyTwilioConfig` → `{configured, missing[], safeLabel}`, no secrets.
- **Router** (`provider-router.ts`): final routing; consistent `{ok, provider, providerMessageId?, internalAccepted?, reason?}`.
- **Brevo email/SMS + Netgsm** adapters added (server-only, scrubbed errors, never fake SENT).
- **Test tools**: WhatsApp → Meta; Email → Brevo; **SMS test added** (country-routed, shows provider, confirm=true, one recipient, origin TEST, delivery log).
- **UI readiness**: Settings shows Meta/Brevo Email/Brevo SMS/Netgsm configured+missing; Twilio/SendGrid under "قديم"; no SendGrid/Twilio as active.
- **Webhooks**: Meta unchanged (signature required in prod). **Brevo webhook** `/api/webhooks/brevo/transactional` added (optional `?token=` secret; advances already-accepted deliveries by messageId; never fakes). **Netgsm DLR** documented as not implemented.
- **Campaigns**: executor already routes through `sendPreparedDelivery` → now uses the final providers automatically (WhatsApp/Meta, Email/Brevo, SMS TR/Netgsm, SMS intl/Brevo). SMS blocked reasons surface `NETGSM_NOT_CONFIGURED` / `BREVO_SMS_NOT_CONFIGURED`.

## Env vars
**Required (new/active):**
- Meta: `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_APP_SECRET`, `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`,
  `META_WHATSAPP_BUSINESS_ACCOUNT_ID`, `META_GRAPH_VERSION`, optional `META_WHATSAPP_PHONE_NUMBER_ID`.
- Brevo: `BREVO_API_KEY`, `BREVO_EMAIL_SENDER_EMAIL`, `BREVO_EMAIL_SENDER_NAME` (opt), `BREVO_SMS_SENDER`,
  `BREVO_SMS_DEFAULT_TYPE` (opt), `BREVO_SMS_WEBHOOK_SECRET` (opt).
- Netgsm: `NETGSM_USERCODE`, `NETGSM_PASSWORD`, `NETGSM_HEADER`, `NETGSM_SMS_ENDPOINT` (opt),
  `NETGSM_STATUS_ENDPOINT` (opt).

**Legacy (reference only — not used by active sending):** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_WHATSAPP_FROM`, `TWILIO_SMS_FROM`, `SENDGRID_API_KEY`, `SENDGRID_FROM`,
`EMAIL_LEGACY_SENDGRID_FALLBACK` (opt, default off).

## Remaining legacy / TODO (automatic messages)
Not migrated in this package — documented so nothing fakes a send:
- `lib/events/dispatch.ts` and automatic donation confirmation / failed-payment / receipt notifications
  still use the legacy `lib/email.ts` (SendGrid) / `lib/whatsapp.ts` / `SentMessage` path.
  **Next package**: route these through `sendPreparedDelivery` + `CommunicationDelivery` (Brevo/Meta/Netgsm),
  keeping `SentMessage` only as a secondary legacy mirror.
- `app/api/templates/{email,whatsapp}/send` legacy template-send routes remain for the old
  `/dashboard/templates` page; not part of the Communication Center send path.

## Live QA required (do NOT claim production-ready without these)
- Meta: real WhatsApp send + wamid + webhook status + inbound.
- Brevo: real email send (messageId) + intl SMS send (messageId), Arabic intact.
- Netgsm: real Turkish SMS send; **confirm response format** and adjust parsing if needed.
- Verify missing-config paths → SKIPPED (never SENT) for each provider.
