# Package — Communication Center Runtime Foundation (data + services, no sending)

Status: **done.** No real messages sent. Legacy Twilio/SendGrid/SentMessage untouched.
Date: 2026-07-05

## Goal
Add the runtime data schema and service foundation for the Communication Center so later
packages can render, route, archive, and (eventually) send — without sending anything now,
without webhooks, without Inbox, and without touching the payment or tracking flows.

## Models added (`prisma/schema.prisma`, MongoDB)
All channel/provider/status/purpose/origin fields are **String** (not Prisma enums) so the
lifecycle can evolve safely on MongoDB; allowed values are documented inline in the schema and
centralized in `lib/communication/communication-runtime-types.ts`.

1. **CommunicationSender** — WhatsApp/Email/SMS senders (phoneNumberId, businessAccountId,
   senderEmail, smsSender, supportedLocales/Countries/Purposes, status, isDefault, enabled,
   priority, health/error). Supports **multiple WhatsApp numbers**.
2. **SenderRoutingRule** — locale/country/purpose → senderId (+ fallbackSenderId, priority, enabled).
3. **DonorCommunicationProfile** — unified per-donor profile (`userId @unique`), preferredLocale,
   opt-ins, doNotContact, consent + donation signals, per-channel last-contacted timestamps.
4. **CommunicationCampaign** — DRAFT→REVIEW→APPROVED→SCHEDULED→SENDING→SENT/CANCELLED/FAILED,
   audience/template refs, approval + result counters.
5. **CommunicationDelivery** — the **new archive layer** (per-message record with full lifecycle
   status, rendered snapshot, provider ids, timestamps). Legacy `SentMessage` stays as the legacy archive.
6. **CommunicationProviderEvent** — provider webhook/event log with a **unique `idempotencyKey`**
   (foundation for idempotent webhooks later).

Allowed values: channel `WHATSAPP|EMAIL|SMS`; provider `META_WHATSAPP|TWILIO|SENDGRID|NETGSM|CUSTOM`;
purpose `MARKETING|UTILITY|TRANSACTIONAL|AUTHENTICATION`; sender status `ACTIVE|DISABLED|NEEDS_ATTENTION|NOT_CONFIGURED`;
campaign status `DRAFT|REVIEW|APPROVED|SCHEDULED|SENDING|SENT|CANCELLED|FAILED`; delivery origin
`MANUAL|CAMPAIGN|TRIGGER|TEST|REACTIVATION|SYSTEM`; delivery status
`DRAFT|QUEUED|RENDERED|SKIPPED|SENT_TO_PROVIDER|SENT|DELIVERED|READ|OPENED|CLICKED|REPLIED|FAILED|BOUNCED|UNSUBSCRIBED|CANCELLED`.

## Services added (server-side, no external providers)
- **`lib/communication/delivery-log-service.ts`** — `createDeliveryRecord` (before send, never a
  provider-success status at creation), `recordSkippedDelivery(reason)`, `markDeliveryStatus`
  (**rejects SENT/DELIVERED/… without a real `providerMessageId`** — never fake SENT), `listDeliveries`.
- **`lib/communication/sender-service.ts`** — CRUD for senders + `toSenderConfig()` bridging a
  stored sender into the pure `sender-router` config (so routing runs on real senders).
- **`lib/communication/routing-rule-service.ts`** — CRUD for routing rules + `toRoutingRuleConfig()`.
- **`lib/communication/donor-communication-profile-service.ts`** — `getProfile`,
  `upsertProfileForUser` (locale via catalog → country → default; email/SMS opt-in mirror
  `User.emailNotifications`/`smsNotifications`; **WhatsApp opt-in stays false — never assumed**),
  `touchProfileCommunication`. Does **not** auto-run on paid donation (donation flow untouched).
- **`lib/communication/campaign-service.ts`** — CRUD + guarded transitions
  (SUBMIT_REVIEW/APPROVE/SCHEDULE/CANCEL). Never moves to SENDING/SENT; approval is recorded.
- **`lib/communication/communication-runtime-types.ts`** — allowed-value constants, union types,
  validators, and `PROVIDER_SUCCESS_STATUSES`/`isProviderSuccessStatus` (the "never fake SENT" guard).

Minor: `sender-router.ts` `provider`/`supportedPurposes`/rule `purpose` widened to `string` (runtime
providers/purposes) — pure logic unchanged.

## Legacy left untouched
`SentMessage`, `WhatsappTemplate`, `EmailTemplate`, `MessageTrigger`, `lib/whatsapp.ts` (Twilio),
`lib/email.ts` (SendGrid), and `lib/events/dispatch.ts` — no changes. `SentMessage` remains the legacy
archive; `CommunicationDelivery` is the new one.

## Safety
- No payment, checkout, or tracking changes. No provider tokens stored or exposed; no external calls.
- Every service guards on `DATABASE_URL`, returns typed results, and never throws destructively.
- Create/update/transition actions write `AuditLog` (`communication.*`) with `externalCall:false`.
- Missing provider config → SKIPPED/FAILED with a reason, never SENT.

## Validation
- `npx prisma validate` — schema valid. `npx prisma generate` — client generated.
- `npx tsc --noEmit` — new files add **0 errors**. `npx next build` — green (see final response).

## Remaining next package
Package 2 — Multi-sender WhatsApp: Meta WhatsApp Cloud API adapter skeleton
(`lib/communication/providers/meta-whatsapp/`, server-only, gated on `META_WHATSAPP_NOT_CONFIGURED`),
Senders/Routing management pages, sender health checks, and webhook verification — still no
production sends. Then templates/language-coverage, campaign send-with-approval, and Inbox.
