# Package — Meta WhatsApp Cloud API adapter, webhooks & Inbox

Status: **done.** Real sending stays config-gated (disabled with no credentials). No fake SENT.
Date: 2026-07-05

## Official docs consulted (summarized)
From the official Meta WhatsApp Business Platform / Cloud API + Graph API webhooks docs
(see `docs/integrations/meta-whatsapp-cloud-api.md` for the full write-up):
- **Send:** `POST https://graph.facebook.com/<version>/<PHONE_NUMBER_ID>/messages`, `Authorization: Bearer <token>`,
  `type: "template"` with `template.name` + `template.language.code` (+ optional `components`); response
  `messages[0].id` is the `wamid`.
- **Webhook verify (GET):** `hub.mode=subscribe`, compare `hub.verify_token`, echo `hub.challenge` with 200.
- **Webhook signature:** `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256(raw body, app secret).
- **Payload:** `object=whatsapp_business_account` → `entry[].changes[].value` with `metadata`, `contacts`,
  `messages` (inbound), `statuses` (sent/delivered/read/failed). Subscribed field: `messages`.

## Provider files added — `lib/communication/providers/meta-whatsapp/`
- `types.ts` — config, send/health, normalized webhook event types.
- `errors.ts` — safe reason codes + `scrubSecrets` (strips Bearer/EA tokens) + `mapGraphError`.
- `client.ts` — `getMetaConfig` (env, server-only), `isMetaConfigured`, `graphFetch` (adds Bearer,
  maps errors, never leaks token), `healthCheck` (per phoneNumberId — multi-number aware).
- `messages.ts` — `sendTemplateMessage` → real Cloud API call, returns `wamid` as providerMessageId; safe reason on failure.
- `templates.ts` — `listApprovedTemplates` (read WABA `message_templates`).
- `webhooks.ts` — `verifyWebhookChallenge`, `verifyWebhookSignature` (timing-safe HMAC), `parseWebhookPayload`
  (normalizes statuses + inbound, builds idempotency keys, sanitizes — no raw payload/secrets).

## ProviderRouter
`resolveProviderForSend(channel, sender?)` now handles WhatsApp via the adapter:
- no credentials → `META_WHATSAPP_NOT_CONFIGURED`
- sender without a phoneNumberId → `META_WHATSAPP_SENDER_MISSING_PHONE_NUMBER_ID`
- else `{ canSend: true, providerId: "META_WHATSAPP" }`. Email/SMS remain not-configured. Never fakes SENT.

## Webhook route added
`/api/webhooks/meta/whatsapp` (public, nodejs):
- **GET** — verification handshake (verify token → echo challenge, else 403).
- **POST** — reads the **raw body**, validates `X-Hub-Signature-256` (401 on mismatch; accepted-but-flagged
  when no app secret in dev), parses + processes, always 200 on genuine payloads (never throws unsafe errors).
- `webhook-service.processWhatsappEvents` — inserts an **idempotent** `CommunicationProviderEvent` per event
  (unique `idempotencyKey`; duplicates ignored), and on a status match updates the `CommunicationDelivery`.

## Status mapping
`sent → SENT`, `delivered → DELIVERED`, `read → READ`, `failed → FAILED` (with sanitized error);
send-accept → `SENT_TO_PROVIDER`; an inbound reply marks the last outbound delivery `REPLIED`.
Provider-success statuses require a real `providerMessageId` (enforced by `markDeliveryStatus`).

## Inbox route added
`/dashboard/operations/communication/inbox` + `/api/.../inbox`. Conversations are **derived** from
outbound `CommunicationDelivery` + inbound/status `CommunicationProviderEvent`, grouped by phone
(no new table). Donor matching is **by phone only**; 0 or >1 matches → **unresolved contact** (never
randomly attached). Detail shows donor profile (language/country/donations/opt-in), a merged
inbound/outbound/status timeline, filters (needs-reply / unresolved / by language), and safe states
(no provider configured / no conversations / unresolved). Direct reply is disabled until send is enabled.

## Missing-config behavior
With no Meta credentials (current `.env`): health check + send return `META_WHATSAPP_NOT_CONFIGURED`;
ProviderRouter blocks sending; the webhook GET returns 403 (no verify token) and POST cannot verify
signatures; the Inbox shows the "provider not configured" notice. No message is ever marked SENT.

## Security & sanitization
Server-only; access token/app secret never sent to the client, logged, or thrown (`scrubSecrets`,
`mapGraphError`). Only `payloadSanitized` is stored for provider events. Idempotency via unique
`idempotencyKey`. Webhook validated by verify token + HMAC signature.

## Build result
- `npx tsc --noEmit` — new files add **0 errors**. `npx next build` — green (see final response).
- No payment/tracking/Twilio/SendGrid changes; legacy messaging untouched.

## Remaining next package
Turn on real outbound (test-send + approved-campaign send through the adapter behind approval) once
credentials are configured; sync approved templates from Meta into `WhatsappTemplate`; richer Inbox
reply via approved templates + delivery archive.
