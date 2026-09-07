# Meta WhatsApp Cloud API — Integration

Source: official Meta WhatsApp Business Platform / Cloud API documentation
(developers.facebook.com/docs/whatsapp/cloud-api) and Graph API webhooks getting-started.
Consulted 2026-07-05. This adapter is written to those docs, not from memory.

## Required Meta product setup
1. A Meta app (Business type) with the **WhatsApp** product added.
2. A **WhatsApp Business Account (WABA)** connected to the app.
3. At least one registered **business phone number** on the WABA.
4. A **System User** (or app) **access token** with `whatsapp_business_messaging` +
   `whatsapp_business_management` permissions.
5. A **webhook** configured on the app's WhatsApp product, subscribed to the `messages` field.

## Required credentials (server-side only — never in the frontend)
| Purpose | Env var |
|---|---|
| WABA id | `META_WHATSAPP_BUSINESS_ACCOUNT_ID` |
| Default phone number id | `META_WHATSAPP_PHONE_NUMBER_ID` |
| Access token | `META_WHATSAPP_ACCESS_TOKEN` |
| Webhook verify token | `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` |
| App secret (payload signature) | `META_WHATSAPP_APP_SECRET` |
| Graph API version (optional) | `META_GRAPH_VERSION` (default `v25.0`) |

Multiple sender numbers: each `CommunicationSender` (channel WHATSAPP, provider META_WHATSAPP)
carries its own `phoneNumberId` / `businessAccountId`. The adapter sends using the **selected
sender's** `phoneNumberId`; the env `META_WHATSAPP_PHONE_NUMBER_ID` is only a fallback/default.

## Sending template messages
- **Endpoint:** `POST https://graph.facebook.com/<version>/<PHONE_NUMBER_ID>/messages`
- **Auth:** `Authorization: Bearer <ACCESS_TOKEN>`
- **Body (template):**
  ```json
  {
    "messaging_product": "whatsapp",
    "to": "<E164_NO_PLUS_OR_WITH_PLUS>",
    "type": "template",
    "template": {
      "name": "<approved_template_name>",
      "language": { "code": "<bcp47, e.g. ar / en_US>" },
      "components": [ { "type": "body", "parameters": [ { "type": "text", "text": "..." } ] } ]
    }
  }
  ```
- **Response:** `{ "messaging_product": "whatsapp", "contacts": [...], "messages": [ { "id": "<wamid...>" } ] }`.
  The `messages[0].id` (a `wamid`) is stored as `CommunicationDelivery.providerMessageId`.
- Only **approved** templates can be sent. Template category + approval status are managed in Meta;
  this app tracks availability via `WhatsappTemplate` and the language-coverage check.

## Health check
`GET https://graph.facebook.com/<version>/<PHONE_NUMBER_ID>?fields=verified_name,quality_rating,display_phone_number`
with the Bearer token. Used to report sender readiness/quality; never exposes the token.

## Webhook — verification (GET)
Meta sends a GET with `hub.mode` (always `subscribe`), `hub.verify_token`, and `hub.challenge`.
The endpoint verifies `hub.verify_token` == `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` and, on match,
responds with the raw `hub.challenge` value and HTTP 200. Otherwise 403.

## Webhook — payload signature
Notifications include `X-Hub-Signature-256: sha256=<hex>`, an **HMAC-SHA256 of the raw request body**
keyed by the **app secret**. The receiver recomputes it (timing-safe compare) and rejects mismatches.
If no app secret is configured the signature check is skipped and logged (dev only).

## Webhook — subscribed fields
Single field: **`messages`** (covers both inbound user messages and outbound message statuses).

## Webhook — payload structure
```
{ "object": "whatsapp_business_account",
  "entry": [ { "id": "<WABA_ID>", "changes": [ { "field": "messages", "value": {
    "messaging_product": "whatsapp",
    "metadata": { "display_phone_number": "...", "phone_number_id": "..." },
    "contacts": [ { "wa_id": "...", "profile": { "name": "..." } } ],
    "messages": [ { "from": "...", "id": "<wamid>", "timestamp": "...", "type": "text", "text": { "body": "..." } } ],
    "statuses": [ { "id": "<wamid>", "status": "sent|delivered|read|failed", "timestamp": "...",
                    "recipient_id": "...", "conversation": {...}, "pricing": {...}, "errors": [...] } ]
  } } ] } ] }
```

## Status webhook behavior → internal status mapping
| Meta status | CommunicationDelivery status |
|---|---|
| (send accepted by API) | `SENT_TO_PROVIDER` |
| `sent` | `SENT` |
| `delivered` | `DELIVERED` |
| `read` | `READ` |
| `failed` | `FAILED` (with sanitized error) |
Inbound user message → a `CommunicationProviderEvent` (`eventType: "inbound_message"`) and, when it
replies to a known conversation, the related delivery is marked `REPLIED`.

## Inbound message behavior
Each inbound message is stored as a `CommunicationProviderEvent` with a **sanitized** payload
(text body, sender wa_id, profile name, wamid, timestamp) — never the raw payload. The Inbox derives
conversations from these inbound events + outbound `CommunicationDelivery` rows, grouped by phone.
Donor matching is by phone number only; ambiguous/absent matches are shown as **unresolved contact**.

## Security and sanitization rules
- Server-only. The access token/app secret are never sent to the client or written to logs/errors.
- Provider error responses are mapped to safe internal codes; raw tokens are stripped before storing.
- Only `payloadSanitized` is persisted for provider events (no raw payload, no secrets).
- Webhook processing is **idempotent** via a unique `idempotencyKey` per (wamid + status/inbound).

## Known limitations
- Real sending is **disabled until credentials are configured**. With no token, ProviderRouter returns
  `META_WHATSAPP_NOT_CONFIGURED`; with a sender lacking a phone id, `META_WHATSAPP_SENDER_MISSING_PHONE_NUMBER_ID`.
  Deliveries are recorded SKIPPED/FAILED — never a fake SENT.
- Template component parameter serialization follows the official send-message-templates guide and is
  passed through as provided; this app does not invent unsupported components.
- 24-hour customer-service window rules, template pacing/quality limits, and pricing are enforced by
  Meta, not re-implemented here.
- Media messages, interactive messages, and flows are out of scope for this package (template + text only).

## Final architecture status
Meta WhatsApp Cloud API is the **sole active WhatsApp provider** (Twilio is legacy-disabled and never
used for WhatsApp). Adapter files: `lib/communication/providers/meta-whatsapp/{client,messages,webhooks,errors,templates,types}.ts`.
Router: WhatsApp always resolves to `META_WHATSAPP`; multi-number sends use `sender.phoneNumberId`;
webhooks store inbound as `CommunicationProviderEvent` (with `senderId`) and advance
`CommunicationDelivery` statuses (SENT/DELIVERED/READ/FAILED). Signature verification is required in
production.
