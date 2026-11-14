# Minber — Tracking and payment acceptance gate (2026-11-12)

## Engineering scope
- New Minbar cart emits AddToCart for **actual additions only**.
- New checkout emits BeginCheckout, AddPaymentInfo and payment_submit, without PAN, CVC, donor phone or email.
- Canonical GA4 funnel uses sanitized ecommerce data in either direct gtag **or** GTM dataLayer.
- No generic X conversion. Meta Donate/Purchase remain verified-payment-owned, sharing stable IDs with browser pixel to dedupe.
- Missing and denied marketing consent load no optional browser pixels, recorders, or browser-reported CAPI. The donor can still pay.
- /api/track is browser-origin restricted, bounded in body length, only accepts non-financial canonical stages, strips tokens/queries/private-path IDs. It does NOT establish a paid donation.
- Optional FunnelObservation ledger remains OFF until approved: FUNNEL_OBSERVATION_ENABLED=true. Aggregated admin API returns browser-reported stage counts, not genuine provider delivery or revenue.

## No-merge blockers, despite green CI
1. Test real opted-in and opted-out browser sessions via staging on all public locales, including consent withdrawal, SPA transitions, Back/Forward and cookie rejection.
2. Test GTM Tag Assistant, Meta Events Manager Test Events (Pixel/CAPI), GA4 DebugView, TikTok Test Events, X/Google Ads. Match campaign_id/amount/currency/content IDs; check blocked and allowed consent cases.
3. Verify paid conversions through Albaraka, PayFor, PayPal and Stripe sandbox: 2D, 3D, canceled, failed, delayed callback, duplicate callback, successful charge, renewal and mixed one-time/recurring basket. Prove exactly one revenue conversion per confirmed transaction, and no phantom purchases for pending/cancelled.
4. Server-initiated conversion dispatch must respect a **durable donor consent snapshot** and permitted use purposes; opt-out through client cookies alone cannot prove server webhook consent. This is a distinct, unresolved legal/security design problem.
5. /api/track public provider fan-out needs durable rate limits and origin/proxy trust verification, beyond browser cookie checks. Current opt-in observation limiter is not a universal provider proxy limiter.
6. Verify live VPS deploy SHA separately from main and record rollback readiness; no production changes authorized.
7. Security abuse guard PR #165 is separately DRAFT and OFF; sandbox signatures, Mongo CAS/TTL and trusted IP tests must be accepted before enabling.

## Evidence
- Each CI green run is evidence of **synthetic** behavior at its exact SHA, not genuine bank settlement, external ingestion or production status.
- 24h/72h stage counts (when explicitly enabled) are **browser-reported** and can be forged. Never use them as the financial ledger.
- No real banking charge, donor DB mutation or outbound campaign was performed during this review.
