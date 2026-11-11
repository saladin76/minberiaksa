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


## Review gate — 2026-11-11: architectural privacy and conversion acceptance

All three CI workflows on `e77416f690ef5ca74cd326478ac4c7ed9c80d422` passed. These are code/fixture checks, not Clarity provider session-capture proof. The review findings below do not change production behavior.

### Confirmed architecture and unresolved risk

- `app/layout.tsx` mounts `<MicrosoftClarity />` in the root layout, outside locale/private page components. `usePathname` and `useLayoutEffect` invoke `clarity("stop")` on protected routes, but an SDK loaded on a public page remains resident in the SPA document. **Do not equate command invocation with a verified no-network/no-DOM boundary**; the next private DOM may render while script observers/queued payloads still exist. Even React before-paint effects are not a demonstrated privacy/transport guarantee.
- `lib/tracking/private-path.ts` denies dashboard, login, account/profile, cart, checkout, recurring/subscriptions, payment outcomes and receipts with locale prefixes. The allowlist is path-dependent and cannot classify a donor/payment modal opened on a public URL or consent changes with no navigation. A mask is defense-in-depth, not a security isolation boundary.
- `lib/analytics.ts` gates diagnostic events and dataLayer on route/consent/GPC/DNT and makes `clarityIdentify` a no-op. Confirm no additional dynamic/third-party tags supply Clarity independently. No direct `Clarity.init` or other `clarityIdentify` caller was found via repository code search; **external GTM container is not inspectable from this repository**.
- Current GPC/DNT and denied consent cookies are checked before recorder startup and diagnostic dispatch. A loaded recorder does not subscribe centrally to all same-URL consent revocations or modal visibility changes. Microsoft documents limited cookieless measurement even with denied ConsentV2. A strict no-transmission rule requires preventing the SDK from loading on confidential documents, not only passing denied consent.
- Candidate architecture for independent review: keep public page shell eligible for recorder; move private account/payment/cart/receipt views into a recorder-free *document boundary* and use full document navigation from recorder-enabled pages. Alternatively disable Clarity site-wide until controlled segmentation and in-page private overlays are proven safe. A nested Next.js layout alone is **insufficient** when the root layout and JS document persist through client transitions; validate document boundary and GTM behavior. Do not implement broad route-group refactor in this tracking PR without review and full regression coverage.

### Privacy risk matrix (code evidence vs required external proof)

| Route or state | Code control found | Evidence still required |
| --- | --- | --- |
| Dashboard, sign-in, registration, donor account/profile | Path-based deny; `stop` and diagnostic gating | No Clarity script initialized on direct load; no collector payloads after SPA navigation, back/forward, overlays |
| Cart, checkout, payment and recurring subscriptions | Path-based deny; form masking is defense-in-depth | No recorder DOM/URL/token/account/card transfer; test fast checkout transition, field autofill, client redirects, mobile |
| Success/failed payment, receipts/certificates | Path-based deny, generic engagement suppressed | No token or receipt URL in Clarity/GTM requests; provider conversion still tied to confirmed PAID + paidAt |
| Public articles/projects with sensitive modal | **No guaranteed route-level isolation** | Synthetic modal with donor identity/payment text/attributes must be absent from collector; consider recorder-free modal route |
| Explicit analytics denial, GPC/DNT, runtime disable or changed Project ID | Pre-init checks, runtime config fetch and `stop` | In-session withdrawal without route change, failure mid-navigation, project switch, collector silence and reload behavior |
| Public/public and private/public SPA transitions, ar/tr/en/fr | Single init guard and tests | Compare real `collect`/script counts and screenshots on desktop/mobile, including rapid Back/Forward |

### GTM/GA4/Ads, donor data and purchase reconciliation

- `components/TrackingPixels.tsx` selects exactly one application-owned Google loader: configured GTM or direct gtag.js for GA4/Ads. `lib/tracking/google-script-policy.ts` deduplicates app-owned container/config insertion in the active document; a separately injected GTM tag, a second container, or GTM-internal Clarity/GA/Ads cannot be excluded without Tag Assistant.
- `components/SuccessFinalConversionTracker.tsx` requests an authorized donation tracking payload before browser conversion; `app/api/donations/[id]/tracking/route.ts` refuses a non-PAID donation or missing `paidAt`. Client storage and canonical event IDs reduce replay but do not prove cross-device/multiple-tab/third-party tag deduplication. Review provider receipts and the separately managed server-side CAPI/GA4 outputs against the financial ledger.
- The authorized success-tracking endpoint provides hashed advanced-matching donor fields to the browser for Meta. Hashes are still sensitive linkable information and must not be pushed to Clarity/GTM, query parameters or logs. Confirm request/response visibility and masking under test-only access.
- **Staging Tag Assistant + Network evidence**: use only a test container and fabricated identities. Record a baseline, test public view/scroll then private routes, reload success with an unconfirmed and a confirmed synthetic donation, compare `dataLayer`, `gtm.js`, `gtag/js`, GA4 Measurement Protocol, Ads conversion and Meta event_id/transaction_id counts. Confirm zero `purchase` for an unconfirmed donation and exact once-per-confirmed-event within expected dedup boundaries, no secret URLs/PII in any destination. Collect redacted HAR, screenshots, provider test-dataset evidence and reviewer signoff.

**Clarity: REQUEST CHANGES for privacy isolation. GTM: code controls reviewed, READY FOR STAGING REVIEW only; no external container acceptance. Never merge or deploy on CI alone.**
