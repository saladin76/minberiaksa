# Elastic Email — Email Integration

Elastic Email is the **only** email provider. Brevo no longer sends email (SMS only), SendGrid is
retired. Server-only: `ELASTIC_EMAIL_API_KEY` is read inside the adapter and is never returned to
the frontend.

## Configuration

Values resolve **database first, environment second** through the integration-settings runtime
(`lib/communication/runtime-config.ts` → `getActiveElasticEmailRuntimeConfig()`). Configure them in
the dashboard at **ربط المنصات والإرسال → المزودون → Elastic Email**; the env vars are a fallback.

| Field (DB key) | Env fallback | Purpose | Required |
|---|---|---|---|
| `API_KEY` | `ELASTIC_EMAIL_API_KEY` | Elastic Email API key with send scope | ✅ |
| `SENDER_EMAIL` | `ELASTIC_EMAIL_SENDER_EMAIL` | sender address on a verified domain | ✅ |
| `SENDER_NAME` | `ELASTIC_EMAIL_SENDER_NAME` | display name on the `From` header | optional |
| `WEBHOOK_SECRET` | `ELASTIC_EMAIL_WEBHOOK_SECRET` | `?token=` secret for the events webhook | optional (server-minted) |

Readiness helper for env-only checks: `getElasticEmailConfig()` in `lib/communication/provider-env.ts`.

## Send flow

`lib/communication/providers/elastic-email/client.ts` → `sendElasticEmail()`

- `POST https://api.elasticemail.com/v4/emails/transactional`, header `X-ElasticEmail-ApiKey`.
- Body (built by the pure `payload.ts` so it is unit-tested without a network call):
  ```json
  {
    "Recipients": { "To": ["donor@example.org"] },
    "Content": {
      "From": "Gözbebekleri <noreply@yedicihan.org.tr>",
      "Subject": "…",
      "Body": [
        { "ContentType": "HTML", "Content": "…", "Charset": "utf-8" },
        { "ContentType": "PlainText", "Content": "…", "Charset": "utf-8" }
      ]
    },
    "Options": { "TrackOpens": true, "TrackClicks": true }
  }
  ```
- Success (2xx): `MessageID` → stored as `CommunicationDelivery.providerMessageId`.
  A 2xx with no id → `internalAccepted` (a real acceptance, never a fake id).
- Timeout 15s. Failures map to safe codes only — the API key never reaches a log or a response.

Callers never import the vendor adapter directly. They go through the channel facade
`lib/communication/providers/email/client.ts` (`sendEmailMessage`, `EMAIL_PROVIDER_ID`), which is the
single place to change if email ever moves to another vendor.

## Error codes

| Code | Meaning |
|---|---|
| `ELASTIC_EMAIL_NOT_CONFIGURED` | API key or sender missing → delivery is SKIPPED, not FAILED |
| `ELASTIC_EMAIL_SENDER_NOT_CONFIGURED` | no sender identity resolved |
| `ELASTIC_EMAIL_UNAUTHORIZED` | 401/403 — key invalid or lacks scope |
| `ELASTIC_EMAIL_RATE_LIMITED` | 429 |
| `ELASTIC_EMAIL_REJECTED` | other 4xx — bad payload or unverified sender |
| `ELASTIC_EMAIL_REQUEST_FAILED` | 5xx, timeout, or network error |

## Connection test (no message sent)

`ElasticEmailConnectionTester` in `lib/integration-settings/provider-testing/index.ts`:

1. `GET https://api.elasticemail.com/v4/domains`
2. `401` → `ELASTIC_EMAIL_UNAUTHORIZED` (hard fail).
3. `403/404/405` → **connected with a note**: a send-scoped key may not list domains, so the sender
   domain simply could not be auto-verified. This is deliberately not a failure.
4. `2xx` → the sender's domain must appear in the list, else
   `ELASTIC_EMAIL_SENDER_DOMAIN_NOT_VERIFIED`.

## Delivery events webhook

Route: `POST /api/webhooks/elastic-email?token=…` (`app/api/webhooks/elastic-email/route.ts`).

- The token is minted server-side via `POST /api/admin/integration-settings/ELASTIC_EMAIL/webhook-token`
  and revealed exactly once in the dashboard. Paste the full URL into Elastic Email under
  **Settings → Notifications**.
- Comparison is constant-time (`webhookTokenMatches`). Unauthenticated calls get 401 in production.
- Payloads are normalized by `providers/elastic-email/webhook-events.ts`, which tolerates single
  objects, arrays and `{Events:[…]}`, plus every observed field-name casing
  (`messageid` / `msgid` / `MessageID`, `eventtype` / `EventType` / `status`).
- Statuses map: Sent→SENT, Delivered→DELIVERED, Opened→OPENED, Clicked→CLICKED,
  Bounced→BOUNCED, Error/AbuseReport→FAILED, Unsubscribed→UNSUBSCRIBED.
- Each event is stored once as a `CommunicationProviderEvent` (unique `idempotencyKey`), then the
  matching `CommunicationDelivery` is advanced through `shouldApplyDeliveryStatus()` so an
  out-of-order `sent` can never downgrade a delivery that already reached `clicked`.

## "Sent" is acceptance, not arrival

A 2xx from `/v4/emails/transactional` means Elastic Email **accepted** the message. The real outcome
lands minutes later on the event feed and can be `Suppress` ("Delivery to this domain is not
permitted on your account until the trust level of your mail increases") or `Error` ("Delivery
failed due to account problem or spam block") — both of which mean the message was never delivered.

Two things keep the dashboard honest about that:

1. `/api/cron/communication-sync-email-events` (every 15 min) pulls `GET /v4/events` and applies the
   verdicts to the delivery rows. Pass `?lookbackMinutes=` for a one-off backfill wider than the
   3-hour default (capped at 30 days); one poll still returns at most `MAX_EVENTS_PER_POLL` events,
   so check the returned `received` count for truncation.
2. `lib/communication/campaign-counter-service.ts` re-derives `sentCount` / `deliveredCount` /
   `readCount` / `clickedCount` / `failedCount` and the campaign status **from the delivery rows**,
   and runs both at the end of a send and after every event batch that moved a delivery. Without it
   the campaign header kept the optimistic numbers written at send time and reported أُرسلت for
   mail the provider had refused.

`deliveredCount` counts only rows where arrival is *proven* (DELIVERED/READ/OPENED/CLICKED/REPLIED).
Elastic Email never emits a `Delivered` event — its `Sent` already means "handed to the recipient's
mail server" and is counted under `sentCount` — so an open or a click is the only positive evidence.

Historical rows written before this existed: `scripts/reconcile-campaign-counters.ts` (dry run by
default, `--apply` to write).

## Tests

`tests/integration-settings/elastic-email.test.ts` covers the catalog contract, field validation,
payload shape, `From`-header escaping, error mapping, key scrubbing, webhook normalization,
idempotency keys, the status ladder and webhook-token handling.
`tests/integration-settings/provider-testing.test.ts` covers the connection tester.
