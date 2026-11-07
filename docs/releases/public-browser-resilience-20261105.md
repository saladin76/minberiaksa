# Public browser resilience — 2026-11-05

Base: `229c922eb01454dd7752363fa46459980d377454`, whose supplied release log confirms activation at 15:58 Istanbul.

## Verified live

- Turkish project/cart/checkout, selected TRY: project 2,500.55 + support 500.25 is exactly 3,000.80 in checkout.
- Cart project title is a real link and cart lines retain cents.
- No payment was submitted; the test basket was emptied after checking.
- The browser recorded `MISSING_MESSAGE: Gift (tr)` on the project surface. The page omitted the `Gift` namespace used by DonationPanel.
- The first checkout render briefly showed an empty USD zero total before local basket hydration; it was disabled. The new guard shows processing until hydration/pricing is ready.
- The project carousel rendered unresized Cloudinary original images. The single-image branch used a CSS background without fetch priority.

## Changes awaiting deployment

1. Catch denied storage reads/getters and writes in the actual TrackingPixels click-ID collector; preserve URL IDs and allow event dispatch to continue.
2. Keep the currency hook's first client render consistent with its server render, then read the cookie after hydration. A failed optional local cache write cannot turn a successful exchange-rate response into a reported fetch failure.
3. Supply Gift translations to project pages. Hold project basket actions while a selected non-USD currency lacks its exchange rate; retain exact cents in the project's confirmation total.
4. Use the existing image resizing helper and responsive srcset for project hero photos, preserving eager/high priority for the cover, lazy secondary slides and the fixed aspect-ratio frame. The one-image case is now an actual high-priority image with its reviewed alt text. Unknown remote hosts retain their original URL.
5. Reuse public project/super-category lookups between metadata and page with React's request-scoped cache. No persistent cross-request project-visibility or financial cache was added.
6. Mark unresolved query macros in Clarity diagnostics, exclude raw placeholder values from campaign labels and preserve the original URL/canonical attribution owner. This does not edit live advertising campaigns or invent replacement values.
7. Add `scripts/audit-team-support-incident.ts`, a bounded read-only candidate search over the last four days: TRY totals 27,000–28,000 or support at least 10,000. No bank calls, DB writes, recipient messages, donor contacts or card data. Candidate matches need receipt/bank confirmation and do not establish an error by themselves.

## Validation and remaining limits

67 focused tests passed across browser-storage denial, currency hydration/cache, project guards and precision, project image rendering, missing translation scope, incident CLI, measurement, mixed checkout and payment handoff. Changed-file lint has zero errors; an inherited native card-logo image warning in checkout is unchanged. Full production build remains a release check.

No post-deployment PageSpeed/Clarity performance gain is claimed for this patch. LCP/INP/CLS need measurement after release. The dominant in-app browser Java bridge messages have not been attributed to first-party code; extension errors observed in this browser are also not website defects.

Ziraat operations still require the merchant-confirmed production API endpoint and encoding (the server audit found both missing). Do not guess either from the 3D checkout URL. Live-ad macros still require correction at their advertising source. The reporting donor's specific transaction and any refund remain unconfirmed pending the read-only production candidate audit and receipt matching.
