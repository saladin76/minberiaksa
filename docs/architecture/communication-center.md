# Communication Center Architecture

This document describes the **current production architecture** for outbound and inbound
communication. The executable invariants live in `lib/communication/README.md` and the canonical
runtime types in `lib/communication/communication-runtime-types.ts`.

## Principle

One communication domain, three channels, provider adapters behind one routing layer.

| Channel | Active provider |
| --- | --- |
| WhatsApp | Meta WhatsApp Cloud API |
| Email | Elastic Email |
| SMS Türkiye | Netgsm |
| SMS international | Brevo SMS |

Twilio and SendGrid are historical only. They must not be reintroduced into active routing.

## Layers

```text
Dashboard / API / event
        |
        v
Application service
  campaign / trigger / inbox
        |
        +--> consent & audience
        +--> template/provider truth
        +--> sender routing
        +--> delivery archive
        |
        v
ProviderRouter
        |
        +--> Meta WhatsApp
        +--> Elastic Email
        +--> Netgsm / Brevo SMS
```

No UI route calls a provider SDK directly. Provider credentials are resolved server-side from the
active integration runtime and are never copied into campaign metadata, audit logs or client state.

## Consent invariants

- `DonorCommunicationProfile` is the runtime source of marketing consent.
- Marketing Email requires `emailOptIn=true`.
- Marketing SMS requires `smsOptIn=true`.
- Marketing WhatsApp requires `whatsappOptIn=true`.
- A phone number, a previous donation, or a successfully delivered transactional message is **not**
  proof of marketing consent.
- Transactional WhatsApp/Email may be sent without marketing opt-in, but `doNotContact=true`
  remains a hard stop.
- Every campaign, smart one-to-one send, automatic marketing trigger and retry must re-check the
  current consent state before provider dispatch.

## WhatsApp provider truth

Meta is authoritative for template status, language, category and quality.

- A variant is sendable only when Meta reports it approved for the exact WABA used by routing.
- `PAUSED`, `DISABLED`, rejected or unknown variants are never considered ready.
- Meta template lifecycle webhooks trigger immediate WABA reconciliation.
- `/api/cron/communication-sync-whatsapp-templates` remains the periodic reconciliation fallback.
- Delivery/inbound webhooks and template lifecycle updates share the same signature-verified
  `/api/webhooks/meta/whatsapp` endpoint.

## Campaign execution

Campaign delivery is resumable and server-side:

1. The browser stores an audience definition/list reference, not thousands of donor ids.
2. `campaign-send-planner.ts` resolves one page.
3. `campaign-send-executor.ts` claims a lease, applies controls, sends a bounded batch and persists
   progress.
4. Recipient-local quiet-hour contacts are moved to
   `CommunicationCampaignDeferredRecipient` instead of pinning the audience cursor.
5. Vercel Cron processes only a small bounded slice per minute. Unfinished campaigns remain
   `SENDING` and continue on the next tick.

This prevents one large campaign or slow provider from consuming the entire serverless runtime.

## Delivery truth

`CommunicationDelivery` is the authoritative outbound archive. Provider acceptance advances a row
to `SENT`; provider webhooks may advance it to `DELIVERED`, `READ`, etc., but never downgrade
terminal truth. `SentMessage` is compatibility/reporting data only where still present.

## Safety and quality gates

- Every outbound attempt is archived before the external call.
- No fake `SENT` status when configuration/provider calls fail.
- Campaign pause, emergency stop, daily cap, speed controls and quiet hours remain enforced.
- Marketing consent is enforced at the shared eligibility/service layers, not just in UI.
- Critical integration regressions run during the Vercel build before Next.js production build.
- The 15-minute template sync is fallback reconciliation, not the sole source of template state.

## Ownership

- `lib/communication/` owns communication business logic.
- `lib/communication/providers/*` owns provider-specific behavior.
- `lib/integration-settings/` owns active provider credentials/configuration.
- `app/api/webhooks/*` owns externally authenticated provider callbacks.
- Dashboard pages are operators of these services; they do not own provider logic.

Do not create parallel communication engines or duplicate provider readers. Extend the canonical
service/adapter that already owns the responsibility.
