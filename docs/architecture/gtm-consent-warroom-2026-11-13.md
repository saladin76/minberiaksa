# GTM consent and browser acceptance — 2026-11-13

Scope: **read-only audit**, main `cfd1afde7955175fd8b3bd686d61d2b5de724e9e`. No payment/purchase/CAPI/webhook changes. This note is not browser or provider acceptance.

## Confirmed from source

- `components/TrackingPixels.tsx`: `whenMarketingAllowed(load)` retrieves runtime config; special immediate fetch for `/success` and `/donation-failed`. The injection effect loads FB, Google (GTM **or** direct gtag), TikTok and X. It does **not** check granted analytics/marketing consent, GPC, DNT, or private route immediately before injection.
- `lib/tracking/marketing-gate.ts`: real interaction **OR** four-second after-load fallback + idle callback. This is a performance gate, **not consent**. `opened` is process-global and is not reset on withdrawal.
- `lib/tracking/google-script-policy.ts`: GTM ID validated; enabled flag required; `gtm.js` added only if matching script absent, `gtm.js` dataLayer event once per container. App-level direct `gtag.js` disabled when GTM enabled. External container tags/triggers are unknown. A script failure removes its element; a later invocation can retry.
- `components/MicrosoftClarity.tsx` and `lib/analytics.ts`: explicit denied cookie/GPC/DNT checks exist, but **missing** consent defaults to allow. Clarity SDK persists across SPA private route changes and stop does not prove network isolation. Same-page private donor modals are not classified by path.
- `lib/tracking/private-path.ts` protects many private paths and sensitive URL parameters, but is not invoked by the GTM loader and does not classify modal privacy.
- `app/layout.tsx` mounts Clarity and EngagementInstrumentation; Vercel Analytics only on Vercel. GTM injection happens from TrackingPixels, not initial server HTML.

## Release blockers

1. Establish and review a single explicit consent contract (Missing/Denied/Granted/Withdrawn, GPC/DNT), with an actually working CMP. Do not treat interaction or timeout as consent.
2. Add conditional loading and revocation behavior for Google/Meta/TikTok/X/Clarity, including initial page, same-document navigation and public sensitive overlays. Coordinate changes in `TrackingPixels.tsx` with active GA4 #214 agent; do not edit the file independently.
3. Audit container GTM-TSGD8D2S in Tag Assistant: all tags, their triggers and consent settings; explicitly check GA4/Ads/Meta Purchase duplication against server-owned purchase/CAPI.
4. Execute real Chromium Playwright tests on isolated staging, on `/ar`, `/tr`, `/en`, `/fr`: Missing, Denied, Granted, Withdrawn, GPC, DNT, disabled config, navigation, Back/Forward, public-private-public, sensitive modal, sanitized DOM/dataLayer/network.
5. Verify `gtm.js?id=GTM-TSGD8D2S` request exactly once on a **granted** fresh document; `gtag/js` not injected by app while GTM enabled; no script on denied/missing; no duplicate purchase in GTM Preview, GA4 DebugView or Google Ads diagnostics.
6. Collect Tag Assistant session proof, exact deployment SHA, CSP/network log and exact-head CI. HTTP 200 for the Google script or runtime config is not discovery/ingestion proof.

## Browser evidence status

- Local Chromium found at `/usr/bin/chromium` (version 144.0.7559.96). Avoid hard-coded legacy browser paths and use executable discovery.
- This execution environment cannot resolve `minberiaksa.org`, so live navigation, request capture, Tag Assistant and real network privacy tests have **not** been performed.
- GTM load count observed **in a real browser**: **not measured**. Source/test design expects one injection per page document, but cannot establish external reception.
- No production writes, donor data, bank calls, purchases, or deployment performed.

Decision: **BLOCKED**. Follow-up PR must be isolated from #214 and must pass explicit-consent, browser/network, external container and privacy acceptance before merge.
