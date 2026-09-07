# Brevo — International SMS Integration

Brevo is the **international (non-Turkish) SMS** provider and nothing else. Email moved to
[Elastic Email](./elastic-email.md); the Brevo email adapter and its `EMAIL_SENDER_*` settings were
removed. Turkish numbers (+90) route to [Netgsm](./netgsm-sms.md).

Server-only: `BREVO_API_KEY` is read inside the adapter and is never returned to the frontend.

## Configuration

Values resolve **database first, environment second** (`getActiveBrevoSmsRuntimeConfig()`).
Configure them at **ربط المنصات والإرسال → المزودون → Brevo SMS**.

| Field (DB key) | Env fallback | Purpose | Required |
|---|---|---|---|
| `API_KEY` | `BREVO_API_KEY` | Brevo API key | ✅ |
| `SMS_SENDER` | `BREVO_SMS_SENDER` | SMS sender name/number | ✅ |
| `WEBHOOK_SECRET` | `BREVO_SMS_WEBHOOK_SECRET` | `?token=` secret for the webhook | optional (server-minted) |
| — | `BREVO_SMS_DEFAULT_TYPE` | `transactional` \| `marketing` | optional (default transactional) |

Readiness helper for env-only checks: `getBrevoSmsConfig()` in `lib/communication/provider-env.ts`.

## Send flow

`lib/communication/providers/brevo/sms-client.ts` → `sendBrevoSms()`
- `POST https://api.brevo.com/v3/transactionalSMS/sms`, header `api-key`.
- Body: `sender`, `recipient`, `content`, `type`, `unicodeEnabled:true` (Arabic/Turkish), `tag`, `webUrl?`.
- Success: `messageId`/`reference` → `providerMessageId`. Only non-Turkish numbers route here.

Routing is decided in `providers/sms/client.ts` → `resolveSmsProviderWithRuntime()`:
`isTurkishNumber(phone, country)` → Netgsm, otherwise Brevo.

## Response → status mapping
- SMS reasons: `BREVO_SMS_NOT_CONFIGURED`, `BREVO_SMS_REQUEST_FAILED`, `BREVO_SMS_UNAUTHORIZED`.
- Errors are scrubbed (`scrubBrevo`) — the API key never appears in logs.

## Webhook
`POST /api/webhooks/brevo/transactional?token=…`
- Brevo does not sign transactional webhooks → protected by the server-minted `?token=` secret
  (`POST /api/admin/integration-settings/BREVO/webhook-token`), compared in constant time.
- Every event is mapped through the **SMS** status table (Brevo no longer sends email for us):
  `sent`→SENT, `delivered`→DELIVERED, `hardBounce`/`softBounce`/`rejected`/`blocked`/`error`→FAILED,
  `unsubscribed`→UNSUBSCRIBED.
- Advances an already-accepted delivery matched by `message-id`, guarded by
  `shouldApplyDeliveryStatus()` so a replayed `sent` cannot downgrade a delivered message.
- Always returns 200 (no retry storms); never creates or fakes a SENT.

## Live QA checklist (needs real key)
- [ ] SMS test to a **non-Turkish** number selects Brevo, returns SENT with a messageId.
- [ ] SMS test to a **+90** number selects Netgsm instead (never Brevo).
- [ ] Arabic content arrives intact (unicodeEnabled).
- [ ] Missing `BREVO_API_KEY` → SKIPPED `BREVO_SMS_NOT_CONFIGURED` (never SENT).
- [ ] Webhook advances a delivery to DELIVERED.
