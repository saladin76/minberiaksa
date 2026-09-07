# Package — Marketing Decision Surface (real data)

Status: **done.** Additive; no payment/tracking-sender changes.
Date: 2026-07-04

## Goal
Make the Marketing pages a real decision system (mission: "Marketing must remain a
real decision system, not just a dashboard"), using the reconciliation backend that
already exists — without touching the conversion sender or payment flow.

## Audit findings (what was real vs fake)
- **Conversion/tracking truth layer is REAL.** `ConversionEvent` ledger (raw Mongo
  collection via `$runCommandRaw`, `lib/tracking/conversion-event-log.ts`), real Meta
  CAPI + GA4 server sends, real status-based retry UI (`/dashboard/conversion-events`,
  `retry-truth`, `timeline`). Left untouched (sensitive; changing the sender risks
  payments/tracking). Known structural gaps recorded, not changed: it's not a Prisma
  model; the sender's idempotency gate is a Meta-only `conversionEventsSentAt` flag;
  Google Ads/TikTok/X are browser-only with self-reported status.
- **Campaign-link registry is REAL** (raw Mongo collection `MarketingCampaignLink`,
  full CRUD + soft delete + health scoring + donation-attribution performance). One
  concrete bug: the Link Generator computes and sends `locale`, but the service/route
  **silently dropped it** — the mission lists `locale` as a required field.
- **Overview/insights reconciliation is REAL** — `/api/admin/marketing-intelligence/overview`
  computes spend, platform revenue, site (first-party) revenue, platform vs site ROAS
  from `AdCampaignSnapshot`/`MarketingPlatformDailyMetric` + attributed `Donation`s.
  But the **Insights page discarded** platformRevenue/platformRoas (its local type
  omitted them), so the decision-maker never saw the gap.
- **Results + Recommendations pages show FAKE data** — both render a hardcoded 4-row
  fixture `lib/marketing/results/results-data.ts` (self-labelled "loop-foundation").
  This violates the mission (no fake data presented as real). See "Not done" below.

## What changed
1. **Insights = real Marketing Overview** (`app/(dashboard)/dashboard/marketing/insights/page.tsx`):
   extended the client `Overview` type to include the platform metrics the API already
   returns, and added the mission's overview surface — spend, site revenue (our tracking),
   platform revenue (their reporting), **the difference**, **true ROAS (site) vs platform
   ROAS**, and a revenue-match % — plus a gap-based recommendation ("فجوة في مطابقة الإيراد").
   Pure additive rendering of already-fetched data; no new fetch, no backend change.
2. **Campaign-link `locale` persistence** — threaded `locale` end-to-end through
   `lib/marketing/campaign-links/campaign-link-registry-service.ts` (`CampaignLinkPayload`,
   `CampaignLinkInput`, `readCampaignLinkPayload`, `cleanInput`, `mapCampaignLink`) and the
   POST route. Stored only when it's a known catalog locale (`normalizeLinkLocale` via
   `lib/locales.isKnownLocale`); `"auto"` correctly stores as `null`.

## Safety
- No payment, checkout, tracking-sender, Twilio, or SendGrid changes. No schema changes.
- No secrets to the frontend. Insights change is read-only UI over an existing admin API.
- Typecheck: touched files carry only their **4 pre-existing** `$runCommandRaw`/`InputJsonValue`
  warnings (baseline == after); insights page adds 0 errors. `npx next build` green.

## Not done (explicit, honest — next package, needs its own scope)
- **Results + Recommendations still read the fake fixture** (`results-data.ts`). A faithful
  real-data rebuild is a *feature*, not an additive tweak: the recommendation rules
  (`lib/ai/recommendations/recommendation-rules.ts`) are coupled to the fixture's
  human-authored shape (`assetTitle`, `archiveAssetId`, narrative `decision`/`learning`),
  and the fixture is also consumed by `lib/marketing/command-center/command-center-service.ts`.
  Doing it right = per-campaign attributed performance (reuse
  `campaign-link-performance-service`) feeding an async results service + status derivation,
  with ripple into command-center. Scoped as the **next marketing package** to avoid a
  risky broad refactor here. Until then, treat Insights + campaign-links as the real
  decision surfaces; Results/Recommendations are placeholder and must not drive spend.
- Non-Meta ad syncs (Google Ads/TikTok/X/GA4) remain `NOT_IMPLEMENTED` stubs; platform
  spend/revenue is Meta-API + manual CSV only. Real provider syncs are later packages.

## Testing
- `npx tsc --noEmit` — no new errors vs baseline (4 == 4 in the two registry files; insights 0).
- `npx next build` — green (NEXT_EXIT=0).
- Manual: open `/dashboard/marketing/insights` → now shows platform revenue, the gap, and
  site-vs-platform ROAS. Save a link in `/dashboard/link-generator` with a specific locale →
  the registry record now carries `locale` (verify via campaign-links API/detail).
