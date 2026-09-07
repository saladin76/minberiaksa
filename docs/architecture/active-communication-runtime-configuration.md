# Active Communication Runtime Configuration

## Source order

All active communication sends and provider webhooks resolve configuration on the server in this order:

1. The approved active value in `IntegrationSetting`.
2. The matching environment variable when the active database field does not exist.
3. `PROVIDER_NOT_CONFIGURED` when neither source supplies the required field.

Pending values are never returned by active runtime resolution. They are available only to the candidate connection-test workflow and cannot affect sends or public webhooks before approval.

The system never copies database values into `process.env` and never mutates `process.env` at runtime.

## Central runtime layer

`lib/communication/runtime-config.ts` is the server-only entry point. Provider clients do not query Prisma or decrypt secrets themselves.

The main functions are:

- `getActiveMetaWhatsappRuntimeConfig()`
- `getActiveMetaWebhookConfig()`
- `getActiveElasticEmailRuntimeConfig()`
- `getActiveBrevoSmsRuntimeConfig()`
- `getActiveBrevoWebhookSecret()`
- `getActiveElasticEmailWebhookSecret()`
- `getActiveNetgsmRuntimeConfig()`
- `getActiveCommunicationRuntimeBundle()`

Each result contains internal readiness, enabled state, safe failure reason, field sources, and server-only values. These objects must never be returned by a route, stored in a campaign, included in a queue payload, attached to a delivery record, or written to audit metadata.

## Disabled providers

The provider `enabled` flag blocks new outbound sends with `PROVIDER_DISABLED`. It does not trigger a legacy fallback.

Meta, Elastic Email, and Brevo webhooks deliberately resolve approved active verification secrets even while outbound sending is disabled. Delivery, read, open, click, and failure events for messages accepted before the provider was disabled must continue to update existing delivery records. Removing or rotating a webhook secret is the explicit way to stop webhook verification.

## Failure boundaries

- Database unavailable: environment fallback is permitted for all configured fields.
- Active database field missing: environment fallback is permitted for that field.
- Active encrypted database value cannot be decrypted: fail closed with `INTEGRATION_DECRYPTION_FAILED`; do not silently use the environment value.
- Provider disabled: fail with `PROVIDER_DISABLED`; do not bypass the flag through environment values.
- Required values missing: fail with `PROVIDER_NOT_CONFIGURED`.
- Sender identity missing: fail with `SENDER_NOT_CONFIGURED` or the provider-specific safe equivalent.
- Network failure and provider rejection remain separate provider-safe failures.

## Batch and cache behavior

Campaign execution resolves one `CommunicationRuntimeBundle` before processing recipients and passes it into routing and provider clients. Automatic-event dispatch resolves one bundle per event. Test-send tools resolve one active configuration per request.

The resolver also has an in-memory cache capped at **30 seconds**. Vercel serverless instances do not share memory, so an already-warm instance can continue using the previous approved configuration for at most 30 seconds. No client-side cache, Redis, Edge Config, or secret-bearing queue payload is used.

## Provider behavior

### Meta WhatsApp

Active runtime values include Access Token, App Secret, Webhook Verify Token, Business Account ID, Default Phone Number ID, and Graph API Version. A sender-specific Phone Number ID takes precedence; the approved default is used only when no sender-specific ID exists. Existing template-only automatic-send rules remain unchanged.

### Elastic Email

The approved API key and default sender identity are used for every outbound email. A sender selected inside the Communication Center may override the default sender identity. Elastic Email is the only email path — there is no SendGrid and no Brevo email fallback.

### Brevo SMS

The approved API key and SMS sender are used for non-Turkish destinations. `BREVO_SMS_DEFAULT_TYPE` remains a non-secret infrastructure variable because it controls the Brevo message-type default and is not a credential. There is no Twilio fallback.

### Netgsm

The approved usercode, password, and header are used for Turkish `+90` destinations. `NETGSM_SMS_ENDPOINT` remains a non-secret infrastructure override. A Netgsm failure for a Turkish destination does not reroute the message to Brevo or Twilio.

## Delivery records

Active send paths create `CommunicationDelivery` before calling a provider. The selected provider is recorded, and the record moves to a provider-success status only after provider acceptance. Provider message IDs are stored when returned. Only safe reason codes are stored on failure; credentials, authorization headers, runtime configuration, and sensitive provider responses are forbidden.

## Vercel-only variables

The following variables are intentionally outside the marketing-team UI:

- `INTEGRATION_SETTINGS_ENCRYPTION_KEY`
- `CRON_SECRET`

`CRON_SECRET` remains environment-only because Vercel automatically sends it in the Cron Authorization header. Cron does not read a database setting.

Non-secret infrastructure overrides that remain environment-based include:

- `BREVO_SMS_DEFAULT_TYPE`
- `NETGSM_SMS_ENDPOINT`

Provider credential environment variables remain supported only as backward-compatible fallback inside the centralized resolver.

## Rollback

1. Do not delete the existing environment variables during the initial rollout.
2. To roll back one database field, delete its approved active database value through the authorized integration-settings workflow; the runtime will return to that field's environment fallback.
3. To stop outbound sending immediately, disable the provider. Webhook processing remains available for prior messages.
4. To invalidate a webhook, explicitly rotate or delete its approved verification secret and update the provider dashboard.
5. A source-code rollback can revert the runtime-wiring commit while the legacy environment variables remain in place.

## Legacy providers

Twilio and SendGrid are not part of active Communication Center routing, campaigns, automatic messages, test sends, registration verification, or manual template email sends. Legacy source files may remain for historical migration reference, but active routes do not import them and automated source-contract tests prevent their reintroduction into operational routing.
