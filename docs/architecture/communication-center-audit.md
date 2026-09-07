# Communication Center Architecture Audit

## Decision

The platform should not depend on one messaging vendor for all channels. The product should expose one internal Communication Center, while providers stay behind replaceable adapters.

## Current system review

### Keep and use now

- `/dashboard/operations/messaging`
  - Existing safe UI for templates and message campaigns.
  - No external sending.
  - Uses human review and manual execution.
  - Good MVP foundation.

- `/api/dashboard/operations/messaging`
  - Internal save/remove API.
  - Uses dashboard permissions.
  - Keeps all writes internal and audit-backed.

- `lib/operations/messaging/*`
  - Good temporary persistence layer.
  - Keep until real Prisma communication models are added.

- AuditLog-backed overrides
  - Keep for fast iteration and removable sample data.
  - Replace later with dedicated Prisma models.

### Refactor now

- Rename product language from Messaging Center to Communication Center.
- Treat WhatsApp, Email, and SMS as channels, not separate products.
- Add a communication domain layer under `lib/communication`.
- Add provider registry with replaceable providers:
  - Meta WhatsApp Cloud API
  - Brevo Email
  - Brevo SMS
  - SMS fallback later

### Defer, do not remove

- Marketing performance center.
  - Useful later for campaigns and learning.
  - Should not block Communication Center build.

- AI assistant.
  - Useful later as suggestion-only.
  - Not needed before provider routing, consent, logs, and webhooks.

- Donor reactivation.
  - Depends on consent and segmentation.
  - Build after communication logs and preferences.

### Remove from immediate build scope

- Any automatic sending.
- Any direct page-to-provider API call.
- Any UI that sends to Meta, Brevo, or SMS without provider routing.
- Any campaign send without approval, test, consent checks, and delivery logging.

## Target architecture

```text
Donation Platform
  -> Communication Center
    -> NotificationService
    -> TemplateRenderer
    -> ConsentService
    -> ProviderRouter
    -> DeliveryLogService
    -> WebhookReceiver
      -> MetaWhatsAppProvider
      -> BrevoEmailProvider
      -> BrevoSmsProvider
      -> SmsFallbackProvider
```

## MVP order

1. Provider Connections.
2. Templates with variables.
3. Transactional Flows.
4. Contact Preferences and consent.
5. Delivery Logs.
6. Webhook receiver.
7. Test send only.
8. Real sending after approval.

## Safety rules

- No automatic send before approval.
- No marketing message without consent.
- No provider-specific logic in product pages.
- No secrets in frontend.
- Every delivery attempt must create a log.
- Every webhook must update an existing delivery log.
- All sample records must remain editable or removable.
