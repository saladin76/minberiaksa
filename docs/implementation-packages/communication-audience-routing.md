# Package — Communication Domain Foundation: Audiences + Sender Routing

Status: **done.** Read-only / pure logic; no send, no schema, no provider calls.
Date: 2026-07-04

## Goal
Add the missing Communication Center domain services the mission requires (Package 3 /
acceptance criteria 9, 11, 12) without any real send, external provider call, or Prisma
schema change: dynamic language audiences from the real donor base, pure locale/country/
purpose/fallback sender routing, and a campaign language-coverage check. Everything is
driven by the single locale catalog (`lib/locales.ts`) so no channel hardcodes language.

## New files
- **`lib/communication/audience-service.ts`** — `getAudienceOverview()` computes dynamic
  audiences live from `User` (donor base) grouped by `preferredLang`. Per language it
  returns total, withEmail, withPhone, and marketing **channel eligibility** using safe,
  lawful defaults:
  - EMAIL eligible = has email AND `emailNotifications !== false`.
  - SMS eligible = has phone AND `smsNotifications !== false`.
  - WHATSAPP = has phone → **NEEDS_REVIEW** (no WhatsApp marketing-consent field exists,
    so donors are never silently bulk-eligible — a human must confirm consent).
  Also exports `donorChannelEligibility()` for per-donor checks. Read-only counts (no fetch
  of PII in bulk), no writes.
- **`lib/communication/sender-router.ts`** — pure `resolveSender(request, senders, rules)`.
  Honours explicit `SenderRoutingRuleConfig` (most specific locale>country>purpose first),
  then sender capability (supportedLocales/countries/purposes), priority, status and health,
  then the channel default. Returns `{ sender, matchedBy }` or `{ skipped, reason }` — the
  caller must not send when skipped. No DB/I-O; senders/rules are passed in so a future
  `CommunicationSender` model or config source plugs in without changing the logic.
- **`lib/communication/language-coverage.ts`** — pure `computeLanguageCoverage(recipientLocaleCounts,
  availableTemplateLocales)`: per locale → `EXISTS | FALLBACK | MISSING` (fallback via the
  catalog's `fallbackLocale`), plus `missingWithRecipients` and `canSendWithoutDecision` so a
  campaign can block/warn before sending the wrong language.

- **`app/(dashboard)/dashboard/operations/communication/audiences/page.tsx`** — read-only
  Audiences page (server component) rendering the real language×channel segments with a
  summary, per-language table, empty state, error state, and the consent note. Linked from
  the Communication overview (new "الجماهير حسب اللغة" card).

## Reused (not duplicated)
- `lib/locales.ts` catalog (labels, direction, fallback, enabled) — no locale arrays hardcoded.
- Existing `CommunicationChannel`/`CommunicationPurpose`/`CommunicationProviderKey` types and
  the `consent-eligibility` concept. Existing `User.preferredLang`/`emailNotifications`/
  `smsNotifications` fields (compatibility, not replacement).

## Safety
- No payment, checkout, tracking, Twilio, or SendGrid changes. No Prisma schema change.
- No sends, no external provider calls, no secrets. Audience counts are read-only.
- WhatsApp marketing is never auto-eligible (NEEDS_REVIEW) — consistent with the mission's
  "do not assume marketing consent silently" rule.
- Typecheck: new files add **0 errors**. `npx next build` green.

## Not done (next packages)
- Persisting `CommunicationSender` / `SenderRoutingRule` as real records (a config/model
  source) — the router already accepts them; only the store is pending. Meta WhatsApp Cloud
  API adapter, DeliveryLog on `CommunicationDelivery`, and the real send/approval flow remain
  later packages. Saved audiences (snapshots) and activity/monthly/country segments build on
  `getAudienceOverview`.

## Testing
- `npx tsc --noEmit` — new files clean.
- `npx next build` — green (NEXT_EXIT=0).
- Manual: open `/dashboard/operations/communication` → "الجماهير حسب اللغة" → real donor
  counts per language with per-channel eligibility; WhatsApp shows NEEDS_REVIEW counts.
