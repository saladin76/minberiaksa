# Package — Marketing Results & Recommendations on real data

Status: **done.** Removes the last fake data from Marketing. No payment/tracking-sender changes.
Date: 2026-07-05

## Goal
Close the marketing gap flagged earlier: the Results and Recommendations pages rendered a
hardcoded 4-row fixture (`lib/marketing/results/results-data.ts`) as if it were live campaign
performance — a violation of "no fake integrations" (rule 8) and "no mock UI" (rule 10). Rebuild
both on real data, reusing the existing attribution engine (rule 12 — don't duplicate).

## What changed
- **`lib/marketing/results/results-service.ts`** — rewritten, now **async and DB-backed**.
  Per campaign it computes:
  - site donations + first-party revenue from donation attribution via
    `aggregateBreakdown(donations, "campaign")` (the same engine the ads dashboard uses),
    loaded through the shared `fetchAdsDonations` (last 30 days, incl. `isFirstEverDonation`),
  - spend + clicks from `AdCampaignSnapshot` for the same window,
  - ROAS = first-party revenue ÷ spend, plus a rule-derived status (WINNER/LEARNING/LOSING/WATCH)
    and short data-driven decision/learning text (no fabricated specifics).
  Campaigns that spent but produced no attributed donations are included as cost/awareness rows.
  Empty when there is no ad data and no attributed donations.
- **Deleted `lib/marketing/results/results-data.ts`** (the fake fixture). No other importers.
- **`lib/ai/recommendations/recommendation-service.ts`** — async; feeds the existing rule engine
  (`buildMarketingResultRecommendations`) with the real results. Cleaned the internal `source` label.
- **`lib/marketing/command-center/command-center-service.ts`** — `buildMarketingCommandCenterOverview`
  is now async (awaits real results + recommendations in parallel). Its two callers
  (`command-center/page.tsx`, `lib/executive/system-overview-service.ts`) were already async → `await` added.
- **`results/page.tsx`** and **`recommendations/page.tsx`** — async server components (`force-dynamic`),
  added empty states, and removed forbidden UI text ("AI Foundation", "…تمهيدًا لربطها لاحقًا بـ AI Core",
  "Results Loop") per rule 10.

## Reused (not duplicated)
`fetchAdsDonations` (donation loader + first-donation anchor), `aggregateBreakdown` (attribution
engine), `AdCampaignSnapshot`, the existing `MarketingResultItem` type and `buildMarketingResultRecommendations`
rules. No new attribution/matching logic written.

## Safety
- No payment, checkout, tracking-sender, Twilio, or SendGrid changes. No Prisma schema change.
- Read-only aggregation; no writes, no sends, no secrets. When data is absent → honest empty state
  (never fabricated numbers).
- Typecheck: touched files add **0 errors**. `npx next build` green.

## Testing
- `npx tsc --noEmit` — clean across results-service / recommendation-service / command-center /
  system-overview / the three pages.
- `npx next build` — green (NEXT_EXIT=0).
- Manual: `/dashboard/marketing/results` and `/dashboard/marketing/recommendations` now reflect real
  campaigns (or a clean empty state); `/dashboard/marketing/command-center` and the executive overview
  summaries derive from the same real numbers.
