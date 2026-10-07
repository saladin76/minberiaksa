# Communication Center

This package is the single backend domain for outbound WhatsApp, Email, and SMS.

## Provider matrix

| Channel | Destination | Provider |
| --- | --- | --- |
| WhatsApp | All | Meta WhatsApp Cloud API |
| Email | All | Elastic Email |
| SMS | Türkiye (+90 / TR) | Netgsm |
| SMS | All other destinations | Brevo SMS |

Legacy providers are not part of active routing. Historical provider ids may still exist on old delivery rows and are accepted only when reading history.

## Layering

```text
Dashboard / API routes
        |
        v
Campaign / Trigger / Inbox application services
        |
        +--> Audience & consent
        +--> Template rendering
        +--> Sender resolution
        +--> Delivery archive
        |
        v
ProviderRouter
        |
        +--> Meta WhatsApp adapter
        +--> Elastic Email adapter
        +--> SMS facade
               +--> Netgsm (TR)
               +--> Brevo SMS (international)
```

### Domain and orchestration

- `communication-runtime-types.ts` — canonical channels, purposes, statuses and provider ids.
- `campaign-service.ts` — campaign lifecycle only.
- `campaign-send-planner.ts` — resolves one safe page of recipients.
- `campaign-send-executor.ts` — resumable campaign execution and scheduler handoff.
- `automatic-message-dispatcher.ts` — event-triggered sends using the same provider router.
- `conversation-service.ts` — inbox read model.
- `delivery-log-service.ts` — authoritative delivery archive.

### Audience

- `smart-audience.ts` — rule-based audience definitions and server-side resolution.
- `audience-list-service.ts` — saved/manual audience lists.
- `campaign-recipient-service.ts` — converts an audience into sendable recipient pages.
- `donor-communication-profile-service.ts` and `consent-eligibility.ts` — contact eligibility.

Large campaigns must never send thousands of donor ids from the browser. The browser stores an audience definition; the backend resolves recipients in pages.

### Routing

- `sender-router.ts` is pure and has no database access.
- `sender-resolution.ts` loads sender/routing state once per batch and applies the pure router.
- `provider-router.ts` is the only channel-to-provider dispatch point.
- `runtime-config.ts` is the only source for active provider credentials/configuration.

No product page or campaign service may call a vendor SDK directly.

### Providers

```text
providers/
  meta-whatsapp/   Meta Cloud API
  email/           Email channel facade
  elastic-email/   Elastic Email adapter
  sms/             SMS channel facade
  brevo/           Brevo SMS adapter
  netgsm/          Netgsm adapter
```

Provider adapters return normalized safe result codes. Credentials and raw authorization values never leave the server runtime layer.

## Delivery lifecycle

Every outbound attempt must create a `CommunicationDelivery` before the provider call.

```text
RENDERED / QUEUED
      |
      +--> SKIPPED       validation, consent, configuration or sender gate
      +--> FAILED        provider/network failure
      +--> SENT          provider accepted
             |
             +--> DELIVERED / READ / OPENED / CLICKED / REPLIED
```

Provider webhooks may advance a delivery but must never downgrade it.

## WhatsApp templates

Marketing campaigns use provider-approved Meta templates. The actual resolved message (header, body, footer, buttons and language) is snapshotted on the delivery at send time so the inbox can show exactly what the donor received even if the template is edited later.

## Quiet hours

Fixed-timezone quiet hours gate the campaign globally.

Recipient-local quiet hours never stop the audience cursor. Recipients whose local time is blocked are moved into `CommunicationCampaignDeferredRecipient` and retried by the scheduler later. One sleeping recipient must never stall the rest of a campaign.

## Scheduler

Vercel Cron calls:

`/api/cron/communication-run-due`

The executor uses leases, cursors and persisted progress. A serverless timeout or interrupted request resumes from the last persisted cursor instead of starting over.

## Rules for future work

1. Add provider-specific behavior only inside a provider adapter.
2. Do not add new channel/provider string literals outside the canonical runtime types.
3. Do not bypass consent, sender resolution, or the delivery archive.
4. Do not put provider credentials in campaign metadata, queue rows, audit logs, or client responses.
5. Do not create a second campaign executor or direct-send path for a new UI.
6. Keep historical compatibility code isolated from active routing.
7. Add communication files to `tsconfig.communication-runtime.json` so the domain remains type-clean.
