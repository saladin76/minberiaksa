# Communication Provider Architecture (Final)

Status: **finalized backend routing.** Live provider sends require real credentials (see live-QA notes).

## Final provider matrix

| Channel | Scope | Active provider | Legacy / disabled |
|---|---|---|---|
| WhatsApp | all | **Meta WhatsApp Cloud API** (`META_WHATSAPP`) | Twilio (never used) |
| Email | all | **Elastic Email** (`ELASTIC_EMAIL`) | Brevo Email (`BREVO_EMAIL`), SendGrid (`SENDGRID`) |
| SMS | international (non-TR) | **Brevo SMS** (`BREVO_SMS`) | Twilio (never used) |
| SMS | Turkey (+90 / `TR`) | **Netgsm SMS** (`NETGSM_SMS`) | Twilio (never used) |

Twilio = **LEGACY_DISABLED** — not used by any active send path, no silent fallback.
SendGrid = **REMOVED** — `lib/email.ts` was deleted; there is no SendGrid send path and no flag that
re-enables one.
Brevo Email = **REMOVED** — Brevo is SMS-only. Its email adapter and `EMAIL_SENDER_*` settings are gone.
`BREVO_EMAIL` / `SENDGRID` survive only as accepted *historical* values on delivery rows written before
the migration, so old archive entries still validate.

## Single source of truth
- `lib/communication/provider-registry.ts` → `PROVIDER_REGISTRY`, `activeProviders()`, `legacyProviders()`,
  `providerByKey()`, `isProviderActive()`, `OFFICIAL_PROVIDER_MATRIX`.
- `lib/communication/provider-env.ts` → per-provider `{ configured, missing[], safeLabel }` (no secrets).
- `lib/communication/provider-router.ts` → `resolveProviderForSend()`, `sendPreparedDelivery()`,
  `isSendEnabled()` implement the routing above.
- `lib/communication/providers/email/client.ts` → the channel-level email facade (`sendEmailMessage`,
  `EMAIL_PROVIDER_ID`). Callers depend on this, never on the vendor adapter, so a future email-provider
  swap is a one-file change.

## Routing rules (ProviderRouter)
- **WhatsApp**: `META_WHATSAPP` only. Missing config → `META_WHATSAPP_NOT_CONFIGURED`; missing sender
  number → `META_WHATSAPP_SENDER_MISSING_PHONE_NUMBER_ID`. Success → `providerMessageId` = wamid.
- **Email**: `ELASTIC_EMAIL`. Missing config → `ELASTIC_EMAIL_NOT_CONFIGURED`; missing sender →
  `ELASTIC_EMAIL_SENDER_NOT_CONFIGURED`; 401/403 → `ELASTIC_EMAIL_UNAUTHORIZED`; 429 →
  `ELASTIC_EMAIL_RATE_LIMITED`; other 4xx → `ELASTIC_EMAIL_REJECTED`; 5xx/timeout →
  `ELASTIC_EMAIL_REQUEST_FAILED`. Success → `providerMessageId` = Elastic Email `MessageID`
  (or `internalAccepted` on a 2xx with no id).
- **SMS**: normalize recipient; `+90`/`0090`/`90…`(12 digits)/`countryCode=TR` → **Netgsm**, else **Brevo**.
  - Netgsm: `NETGSM_NOT_CONFIGURED` / `NETGSM_REQUEST_FAILED` / `NETGSM_REJECTED`. Success → jobid or accept.
  - Brevo SMS: `BREVO_SMS_NOT_CONFIGURED` / `BREVO_SMS_REQUEST_FAILED`. Success → messageId.
- **No fallback**: if the routed provider fails, we fail safely with the reason — never Twilio, never a
  silent cross-provider retry.

## Inbound events (webhooks)
| Provider | Route | Auth |
|---|---|---|
| Meta WhatsApp | `/api/webhooks/meta/whatsapp` | `X-Hub-Signature-256` app-secret signature |
| Elastic Email | `/api/webhooks/elastic-email` | server-minted `?token=` secret, constant-time compare |
| Brevo SMS | `/api/webhooks/brevo/transactional` | server-minted `?token=` secret, constant-time compare |

All three store each event once (unique `idempotencyKey` on `CommunicationProviderEvent` for
WhatsApp/Email) and advance the matching delivery through `shouldApplyDeliveryStatus()` —
a forward-only ladder (`SENT → DELIVERED → OPENED/READ → CLICKED`) where terminal outcomes
(`FAILED` / `BOUNCED` / `UNSUBSCRIBED`) always apply. Out-of-order events can never downgrade a
delivery. Every route answers 200 for authenticated calls so a payload we cannot parse does not
trigger a provider retry storm.

## Safety invariants (unchanged)
- Delivery record created **before** any provider call.
- A delivery becomes a provider-success status (SENT/…) only with a real `providerMessageId` **or**
  `internalAccepted` (genuine provider acceptance) — never a fake SENT.
- Missing config → SKIPPED with the exact reason; provider error → FAILED.
- Campaigns still require approval; test/bulk require `confirm:true`. Payments/tracking untouched.

## Return shape
`sendPreparedDelivery` → `{ ok, provider, providerMessageId?, internalAccepted?, reason?, detail? }`.

## Automatic (trigger) messages
Automatic donation confirmation / failed-payment / subscription messages are dispatched by
`lib/events/dispatch.ts` → `lib/communication/automatic-message-dispatcher.ts`. They use the same
Communication Center runtime — a `CommunicationDelivery` (origin `TRIGGER`) is created **before** any
provider call, then advanced to SENT/SKIPPED/FAILED on the real provider outcome. A `SentMessage` row is
written afterwards as a **secondary mirror** (best-effort, not source of truth).

- **Automatic Email → Elastic Email** through `sendPreparedDelivery`. There is no SendGrid path left.
- **Automatic WhatsApp → Meta** using an approved template. **Exact remaining exception:** the stored
  `WhatsappTemplate` model has no Meta-approved template-name mapping yet (existing rows are Twilio-imported
  or MANUAL free-text). Until a template is genuinely Meta-approved (`provider = META`, `approvalStatus =
  approved`, with a name + language), automatic WhatsApp is **SKIPPED** with
  `META_TEMPLATE_REQUIRED_FOR_AUTOMATIC_WHATSAPP` — never sent via Twilio, never faked.
- **Automatic SMS** is implemented (`sendAutomaticSmsMessage`, TR→Netgsm / intl→Brevo) but currently
  **unreachable**: Prisma `enum MessageChannel` is `EMAIL | WHATSAPP` only, so no trigger emits SMS. Adding
  an SMS trigger channel is a future schema change (intentionally not done here).

Twilio is disabled by default (`lib/whatsapp.ts` requires `WHATSAPP_LEGACY_TWILIO_ENABLED=true`) and is
imported by no active route. The old manual route `app/api/templates/whatsapp/send` returns **410**.
`app/api/templates/email/send` now goes through `sendArchivedEmail` → Elastic Email.

## Per-provider detail
- [Meta WhatsApp Cloud API](../integrations/meta-whatsapp-cloud-api.md)
- [Elastic Email](../integrations/elastic-email.md)
- [Brevo SMS](../integrations/brevo-sms.md)
- [Netgsm SMS](../integrations/netgsm-sms.md)
