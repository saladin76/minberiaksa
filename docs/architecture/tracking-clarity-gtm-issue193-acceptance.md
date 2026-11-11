# Issue #193 — Tracking connection acceptance

Scope: a separate PR from #191. No changes to payment settlement, gateway, recurring charges, canonical Purchase or server-side Meta CAPI.

## Stored settings and migration
- Existing TrackingSettings collection and existing permissioned GET/PUT /api/admin/tracking are reused; no new parallel GTM store or schema migration.
- New Clarity fields: clarityProjectId (6-32 ASCII alphanumeric) and clarityEnabled (boolean). GTM reuses googleTagManagerId / googleTagManagerEnabled.
- Without a saved override, retain NEXT_PUBLIC_CLARITY_ID or the verified u60r8zhrzh legacy ID and enabled state; an explicit false is authoritative.
- /api/tracking/config returns public IDs only and is no-store; storage failure fails closed for scripts.
- All mutations require platformConnectionsManage and are included in TRACKING_SETTINGS_UPDATED audit.

## Runtime controls
- Clarity reads the fresh public config after the shared marketing gate, initializes at most once, and is excluded from dashboard/private donor/payment/receipt paths, unapproved hosts, GPC/DNT and analytics opt-out cookies.
- Enabling GTM installs the container only, never a simultaneous app-owned gtag.js/GA4/Google Ads bootstrap. One shared dataLayer is retained.
- GTM content cannot be inspected by the application: Tag Assistant review must confirm the container does not independently duplicate GA4, Ads, Clarity or Purchase.
- No payment-confirmation or server-side Purchase logic was changed.

## Honest status semantics
- Configured: saved or legacy ID exists, enabled.
- Runtime configuration checked: the dashboard compared saved values to a fresh public config GET, with the local inspection timestamp.
- Script observed: requires Staging browser network inspection. Saving configuration is NOT observing a script.
- Externally verified: requires authorized Clarity recording evidence and GTM Tag Assistant inspection; no API currently claims this status.

## Required Staging acceptance (not yet executed)
1. Prove independent Staging, synthetic visitors and no live bank/provider credentials.
2. Authorized manager saves -> reloads -> compares runtime config -> disables -> verifies public recorder absent after refresh.
3. Check /ar, /tr, /en, /fr, desktop/mobile, consent opt-outs, private routes, number of Clarity and GTM script requests.
4. Use GTM Preview/Tag Assistant to inspect the actual container tags and ensure no duplicate Google Purchase/Ads/GA4 tags.
5. Confirm only paid/settled transaction emits a single Purchase with stable event IDs in an approved Meta test dataset. No production donors.
6. Measure Web Vitals against baseline, and obtain finance/security approval before release.

Release decision: NO-GO before Staging and external acceptance. Do not merge or deploy.

## Security review update — 2026-11-11

**Microsoft Clarity provider limitation:** The official Clarity FAQ advises removing tracking code from URLs that must not be recorded (https://learn.microsoft.com/en-us/clarity/faq/). Clarity may collect DOM mutations and attributes (https://learn.microsoft.com/en-us/clarity/clarity-data); masking needs explicit review (https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-masking). Consent denial does not necessarily mean zero telemetry: Clarity's consent V2 documentation describes limited cookieless analytics (https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-consent-api-v2). Therefore SPA `stop/start`, even invoked before paint by React, is **not a verified network-isolation boundary**. No claim of zero private-route transmission is allowed until an authorized synthetic-browser Network/HAR review verifies the provider. Private modal content on unchanged public URLs is another unresolved boundary.

**Additional in-application privacy hardening:** `lib/analytics.ts` now checks the private-route denylist before calling `clarity("identify")`, custom Clarity tags/events, GA4 diagnostic events or GTM dataLayer pushes. It also reads GPC/DNT and explicitly rejected consent cookies at invocation time; this excludes protected paths and blocked consent even when an old script remains mounted. This gate does **not** replace a CMP/Clarity consentV2 integration or stop SDK automatic DOM recording on public modals.

**Safer design if zero private data transmission cannot be demonstrated:** physically separate public recorder-enabled pages from private layouts and force a full-document transition before entering protected routes. Ensure the destination document never includes Microsoft Clarity or a GTM container that injects it. Also exclude/mask private overlays that open without a URL transition; ideally move these to a recorder-free layout. Treat this as a staged architectural change requiring acceptance rather than silently assuming runtime `stop` is sufficient.

**Staging evidence required:** synthetic private identifiers in text, attributes, links and overlay/modal; ar/tr/en/fr, desktop/mobile; preserve network log and inspect Clarity collector payloads before/after navigation, rapid forward/back, page reload, consent revocation, project ID change and API failure; confirm no sensitive payloads in requests or recordings. Review GTM Preview/Tag Assistant container triggers, direct GA/Ads loader exclusivity, stable conversion event ID and no `purchase` on success-page revisit. No production donors, cards or real Purchase events.

**Release decision:** Clarity privacy acceptance remains **REQUEST CHANGES / NO-GO** until verified isolation; GTM needs external container/network verification. CI unit/browser fixtures alone do not meet this bar.
