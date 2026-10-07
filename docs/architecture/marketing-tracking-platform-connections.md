# Marketing Tracking & Platform Connections Architecture

This area has five public dashboard surfaces and each has one clear owner.

## Dashboard surfaces

- `/dashboard/marketing/attribution` — create tracking links and inspect first-party attribution/performance.
- `/dashboard/marketing/tracking` — read-only operational truth for conversion delivery and retries (retry is separately permission-gated).
- `/dashboard/platform-connections/tracking` — configure pixel/tag/server-conversion credentials and inspect tracking readiness.
- `/dashboard/platform-connections/communication` — configure communication providers, senders, routing, webhooks and scheduler settings.
- `/dashboard/platform-connections/health` — connection diagnostics only; it must not mutate settings or send donor messages.

Legacy pages under `link-generator`, `conversion-events`, `pixels`, and `marketing-intelligence/campaign-links` are removed and redirected to these canonical surfaces.

## Separation of responsibilities

```text
Marketing attribution
  -> campaign link registry
  -> canonical UTM/platform identifiers
  -> first-party donation attribution

Marketing tracking
  -> ConversionEvent read model
  -> event timeline
  -> retry action (explicit action permission)

Platform tracking
  -> TrackingSettings configuration
  -> provider-specific diagnostics
  -> test events (only where an actual live test exists)

Communication connections
  -> IntegrationSettings
  -> provider tests
  -> sender routing
  -> scheduler

Connection health
  -> safe snapshots + latest test evidence
  -> no secret values
  -> no configuration writes
```

## Backend rules

1. Tracking settings are read through `lib/tracking/tracking-settings.ts`; API routes must not implement their own collection readers.
2. Viewing conversion truth uses the `pixels` permission. Re-sending a conversion requires the explicit `platformConnectionsTest` action permission.
3. Mutating tracking credentials requires `platformConnectionsManage`; a read-only marketing permission must never edit provider configuration.
4. A configured credential is not a verified connection. UI text must distinguish “configured” from “tested/verified”.
5. Unsupported live provider tests must be shown as unsupported, never returned as successful.
6. Communication provider credentials stay inside the integration-settings/runtime layers; marketing pages do not call provider SDKs directly.
7. Link generation must use current channel/provider vocabulary. Retired Twilio/SendGrid-specific campaign fields do not belong in the active attribution UI.
8. Health pages read evidence only and must not trigger sends, activate candidates, or mutate routing.
9. Legacy routes should redirect; do not reintroduce duplicate page implementations.

## Current active communication providers

- WhatsApp: Meta WhatsApp Cloud API
- Email: Elastic Email
- International SMS: Brevo
- Türkiye SMS: Netgsm

## Deployment

Vercel builds use the focused `build:vercel` command. Heavy repository-wide quality suites stay separate from the deployment build so a safe UI/backend change does not repeat unrelated long-running checks.
