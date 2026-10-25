# Clarity measurement repair — 25 October 2026

## Scope and release state

This branch starts from `2741939` (merged content/SEO PR #90). It changes the
diagnostic measurement layer and client route PageView normalization. It does
not modify donation creation, amounts, cart storage, payment providers,
webhooks, confirmation, reconciliation, recurring jobs, or production data.

The supplied CSVs were inspected as exported data. Replay videos, the private
Clarity project's Smart Event rules, GTM configuration and live provider
settlements were not inspected. No real payment or outbound message was made.
Do not describe this change as fixing all reported payment failures.

## Confirmed repairs

- Application-owned Clarity initialization and passive engagement listeners only
  run in production on exact allowed hosts. Defaults: `minberiaksa.org` and
  `www.minberiaksa.org`. An explicit comma-separated
  `NEXT_PUBLIC_CLARITY_ALLOWED_HOSTS` replaces that list; no wildcards.
  A preview hostname can no longer inherit production collection merely by
  reusing its project ID. This does not disable an independently installed GTM tag.
- `NEXT_PUBLIC_CLARITY_ID` remains authoritative. The previous fallback is
  replaced with the verified Minber project, `u60r8zhrzh`: this matches both the
  supplied recording exports and the live `clarity.ms/tag/u60r8zhrzh?ref=npm`
  script observed on 25 October. The previous fallback was `u614k028k2`.
- `is_paid_traffic` requires an explicit paid medium or an ad-specific click ID
  when no medium exists. Email/organic/social UTMs and fbclid alone are tagged
  traffic, not proof of paid ads. `has_campaign_tags`, `traffic_type` and
  `traffic_classification` retain this distinction. Click ID values remain
  owned by the existing attribution flow; engagement sends presence only.
- Currency URL cleanup and query ordering do not emit another custom route
  event or canonical route PageView. Real pathname/filter/pagination changes do.
  Currency cookies, navigation URLs and provider click-ID attribution are unchanged.
- Custom payloads use an allowlist before Clarity tags, GA4 and dataLayer.
  Tokens, arbitrary query fields, credentials, fragments and donor data are
  excluded. Referrers carry origin only; confirmation/access route IDs are
  removed. This sanitization does not change Clarity's automatic recorder,
  initial pixel bootstrap, existing consent settings, or server-side attribution.
- `rapid_pointer_burst` replaces the misleading custom name `rage_click`.
  Definition remains three nearby pointer presses within one second, once per
  burst. It describes presses and does not prove frustration or a broken button.
  Clarity's built-in Rage clicks remains separate.
- Landing measurement is once per document, including reloads. It no longer
  assumes a sessionStorage flag equals a Clarity session, and disabled storage
  cannot suppress all landing diagnostics. Effect replay does not emit another
  landing/route event; listeners clean up on unmount.
- Every new diagnostic payload has `measurement_version=2`. Do not compare old
  and new totals as identical definitions or backfill historical exports.

## Unresolved work register

| Evidence | Status / next verification |
| --- | --- |
| CL-01 CLS 0.30725 | Not fixed by a telemetry patch. Obtain URL-level performance and reproduce the shifting element before changing layout. |
| CL-02 dead clicks; CL-10 quick backs | Select replay cases and reproduce the actual element/action. Aggregate counts do not identify broken buttons. |
| CL-03 funnel inconsistency | Partial measurement cleanup only. Review private Smart Event definitions and match confirmed server donation events; success-page visits are not confirmed payments. |
| CL-04 postMessage; CL-07 other JS errors | No error suppression added. Android in-app/visibility association is established; stack/source and causal reproduction remain missing. Two sampled error sessions reached success pages. |
| CL-05 LCP; CL-06 INP | Need per-URL traces and representative mobile/in-app testing. No field improvement claimed. |
| CL-08 custom rage; CL-11 traffic classification | Code fixes above, covered by regression tests. |
| CL-09 bots; CL-12 export limits | Need unique bot denominator, timezone, complete exports. No visitor blocking or ad campaign changes. |
| Cross-host preview recording | Application loader/listener guard added. Audit GTM/other independent installations and deployed project ID. |
| Generic QuickDonateBar destinations | Source creates cart items without project/category IDs; existing checkout rejects unmatched items. Still open: resolve each configured intention to an approved published target before modifying this donation entry flow. Do not assign gifts to an arbitrary project. |
| VPS recurring cron IPv4/IPv6 | Previously observed mismatch. No live cron executed or changed here, since activating it can charge subscriptions. |

## Validation and release checklist

Run the branch tests and release gates; record actual results in the PR.
The new regression suite executes real client-module handlers with simulated
React effects/browser targets and fake analytics providers. This validates event
emission, cleanup, route deduplication and sanitization. It is not a real browser,
Clarity replay, production payment or cross-browser end-to-end certification.

Before deployment:
1. Confirm the deployed `NEXT_PUBLIC_CLARITY_ID` matches the intended project and
   allowed hosts. Public build-time variables require a rebuild.
2. Check GTM for duplicate Clarity installations and Smart Event/GTM trigger
   definitions, especially events named Checkout/Begin checkout/Order success.
3. In a safe validation environment with its own analytics project, verify a
   currency-link landing, real route navigation, email vs paid campaign,
   hidden/visible transitions, outbound links and no new conversion events.
4. After deployment, compare version 2 cohorts and URL-level performance using
   the same timezone, browser mix and export windows. Keep financial success
   grounded in confirmed server records.

## Read-only production observations

On 25 October, the Arabic homepage and navigation to
`/ar/pay-zakat-to-palestine` loaded in the cloud desktop browser.
The application-owned Clarity tag used `u60r8zhrzh`, matching the source exports.
The DOM also contained multiple Google measurement/Ads script configurations,
including two script URLs for the same GA4 measurement ID. This requires a GTM
ownership/trigger audit; script presence alone does not prove duplicate
conversions or an incorrect account. No tags or account settings were changed.
The only observed top-level console error in this short run originated in a
browser extension; it is not recorded as a website defect. The Android WebView
postMessage error was not reproduced by this desktop run.

## Recorded validation

On commit `e5d706b`, integration tests passed 787/787 (including 13 new
measurement regressions), the whole-project TypeScript baseline reported zero
errors, and focused ESLint passed. A follow-up adds the independently verified
fallback-ID regression. Final-head checks and remaining release-gate outcomes
are recorded in the PR. No production build, live financial operation, real
Android in-app journey, private replay or deployment is certified by these tests.
