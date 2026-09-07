# Communication Center — Architecture

Canonical architecture for the one Communication Center that handles **WhatsApp, Email,
and SMS as channels** (not separate modules). Pairs with the current-state record in
`docs/architecture/communication-center-audit.md` and the operating-system north star in
`docs/dashboard-operating-system.md`.

## Principle
One center, channels not products. Providers sit behind swappable adapters. WhatsApp moves
toward **Meta WhatsApp Cloud API**; **Twilio stays intact** as legacy/fallback and for SMS;
**SendGrid** stays for email (the only channel configured today). Language is never hardcoded
per channel — everything reads the locale catalog (`lib/locales.ts`).

## Layers (target)
```
UI page  →  API route / server action  →  service  →  repository / provider adapter  →  DB / provider
```
```
Communication Center
├─ TemplateRenderer        lib/communication/template-renderer.ts        (done)
├─ ConsentService          lib/communication/consent-eligibility.ts      (done)
├─ AudienceService         lib/communication/audience-service.ts         (done — dynamic language×channel)
├─ SenderRouter            lib/communication/sender-router.ts            (done — pure locale/country/purpose/fallback)
├─ LanguageCoverage        lib/communication/language-coverage.ts        (done — block wrong-language sends)
├─ ProviderRegistry        lib/communication/provider-registry.ts        (done — metadata)
├─ ProviderConnections     lib/communication/provider-connections.ts     (done — server-side readiness, no secrets)
├─ DeliveryLogService      (pending — extend SentMessage or add CommunicationDelivery)
├─ WebhookReceiver         (pending — idempotent provider events)
├─ ConversationService     (pending — Inbox)
├─ MetaWhatsAppProvider    lib/communication/providers/meta-whatsapp/    (done — adapter + webhooks + inbox; send config-gated)
├─ WebhookReceiver         /api/webhooks/meta/whatsapp + webhook-service  (done — idempotent, signature-verified)
├─ ConversationService     lib/communication/conversation-service.ts     (done — Inbox, phone-matched)
├─ EmailProvider           lib/communication/providers/email/ → lib/email.ts (SendGrid) (done — behind ProviderRouter)
├─ SmsProvider             lib/communication/providers/sms/ (Netgsm TR / Twilio intl)  (done — config-gated router)
└─ LegacyTwilioProvider    lib/whatsapp.ts (Twilio)                      (legacy, working — do not break)
```

## Hard rules (enforced)
- No auto-send; every campaign send requires human approval.
- No page → provider call; UI never holds tokens/secrets.
- No send without consent + channel eligibility. WhatsApp marketing has no consent field yet,
  so audiences mark it `NEEDS_REVIEW` — never silently bulk-eligible.
- Every outgoing message archived; every provider webhook creates/updates a safe, idempotent
  event log; raw payloads sanitized before storage.
- Missing provider config → `SKIPPED` with a clear reason (e.g. `META_WHATSAPP_NOT_CONFIGURED`);
  never a fake "sent".

## Routes
Official home `/dashboard/operations/communication` (+ `/providers`, `/templates`, `/preferences`,
`/flows`, and now `/audiences`). Legacy `/dashboard/messages` + `/dashboard/templates` +
`/api/templates/*` stay as the working Twilio + SendGrid send path (do not delete/break).

## Data (target — reuse first)
Reuse `SentMessage` (message archive), `WhatsappTemplate`/`EmailTemplate` (+ translations),
`MessageTrigger`, `AuditLog`, `User` consent fields. Add only when needed: `CommunicationSender`,
`SenderRoutingRule`, `CommunicationTemplateGroup/Variant`, `CommunicationCampaign`,
`CommunicationDelivery`, `CommunicationProviderEvent`, `DonorCommunicationProfile` — each with
compatibility for existing records, justified in its package doc.

## Provider order (per mission rule 20)
Official docs first → scopes/products → schema → connection health → sync/events/webhooks →
safe implementation → repo docs (`docs/integrations/*`). No provider implemented from memory.
