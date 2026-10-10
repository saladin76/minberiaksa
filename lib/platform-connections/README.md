# Marketing Tracking & Platform Connections

This area has five canonical dashboard surfaces. Do not create parallel pages that own the same data.

## Page ownership

| Surface | Route | Owns |
| --- | --- | --- |
| الروابط والإسناد | `/dashboard/marketing/attribution` | tracking-link builder, campaign-link registry, first-party attribution performance |
| التتبع والتحويلات | `/dashboard/marketing/tracking` | operational conversion-event truth and retry visibility |
| بكسلات التتبع | `/dashboard/platform-connections/tracking` | pixel/tag/server-conversion configuration and diagnostics |
| مزودو التواصل والإرسال | `/dashboard/platform-connections/communication` | Meta WhatsApp, Elastic Email, Brevo SMS, Netgsm, senders and routing |
| فحص الاتصال | `/dashboard/platform-connections/health` | connection-test evidence, scheduler and webhook health |

Legacy routes redirect to these surfaces. Do not restore duplicate page implementations.

## Separation of responsibilities

- Marketing pages answer **what happened** and **which link/campaign gets credit**.
- Platform Connections pages answer **how tracking/providers are configured** and **whether a connection test passed**.
- A configured credential is not proof that an event was delivered.
- A successful provider test is not proof that a donor received a message.
- The conversion-event ledger is the operational truth for server/browser conversion attempts.

## Tracking settings

All reads use `lib/tracking/tracking-settings.ts`.

The dashboard APIs follow the integration permission hierarchy:
- view diagnostics: `platformConnections`
- run tests: `platformConnectionsTest`
- save configuration: `platformConnectionsManage`

The marketing conversion-event viewer uses the `pixels` permission because it is reporting/diagnostics, not provider administration.

## Campaign links

The registry/backend lives under `lib/marketing/campaign-links/`.
The UI must store stable platform ids when available (campaign/ad-set/ad ids) and UTM values as human-readable attribution context.

Active link-source choices are Meta, Google Ads, TikTok, X, Email, WhatsApp, SMS and Organic.
Twilio/SendGrid-specific fields are historical and must not be reintroduced into active UI.

## Communication providers

The active provider matrix is:
- WhatsApp: Meta Cloud API
- Email: Elastic Email
- SMS Türkiye: Netgsm
- SMS international: Brevo

Provider credentials are owned by `lib/integration-settings/`. Sending code must consume the active runtime resolution; it must not read dashboard form state directly.

## Rules for future changes

1. One canonical page per responsibility.
2. No imports from another Next.js `page.tsx`; shared UI belongs in `_components`.
3. No duplicate tracking-settings database readers in API routes.
4. Route permissions must match the page permission model.
5. Old URLs should redirect; old implementations should be deleted.
6. Provider-specific names belong in provider adapters, not generic attribution models.
7. Do not label configuration as verified unless a real provider test succeeded.
8. Do not label a test as “sent” when the integration only validates configuration.
