# Package — Locale Foundation (single source of truth)

Status: **done.** Behaviour-neutral for the public site.
Date: 2026-07-04
Branch note: applied on the working tree (repo auto-commits saved edits as
"Latest"). Recommended feature branch if manually branching:
`feature/dashboard-operating-system-communication-center`.

## Goal
Make `lib/locales.ts` the single source of truth for locales, add the metadata the
Communication Center / audiences / templates need (direction, native label,
fallback, `enabled`), and **register** the target-expansion locales `sq, it, nl, sv`
without publicly routing them (no translations yet → public routing stays on the
enabled 8). This underpins every multilingual system that follows.

## What changed
- **`lib/locales.ts`** — rewritten as a rich catalog:
  - `SUPPORTED_LOCALES` unchanged: `ar,en,fr,tr,id,pt,es,de` (enabled/public set, same order).
  - New `FUTURE_LOCALES = sq,it,nl,sv`, `ALL_LOCALES`, `AnyLocale`.
  - New `LOCALES: Record<AnyLocale, LocaleMeta>` where `LocaleMeta = { code, label,
    nativeLabel, direction, fallbackLocale, enabled }`.
  - `LOCALE_LABELS` / `LOCALE_OPTIONS` now derive from the catalog (identical values).
  - New helpers: `isKnownLocale`, `localeDirection`, `localeMeta`, `ALL_LOCALE_OPTIONS`.
  - `isValidLocale` keeps its historical enabled-only semantics (so `User.preferredLang`
    and public routing can never become an untranslated locale).
- **`i18n/routing.config.ts`** — `locales` now `[...SUPPORTED_LOCALES]`, `defaultLocale` from catalog.
- **`middleware.ts`** — `LOCALES` and the locale-in-path regex now derive from `SUPPORTED_LOCALES`.
- **`app/[locale]/layout.tsx`** — `VALID_LOCALES` derives from `SUPPORTED_LOCALES`. The
  static `rawLocaleMessages` JSON import map stays static (documented sync point).
- **`components/SyncHtmlDir.tsx`** — `<html dir/lang>` from `localeDirection()` /
  `isKnownLocale()` (also fixes the previous `de` gap in its `LANG_MAP`).
- **`app/(dashboard)/dashboard/DashboardLayoutClient.tsx`** — `dir` from `localeDirection(locale)`.
- **`app/(dashboard)/dashboard/_components/DashboardAutoEnhancements.tsx`** —
  `LocaleCode`/`supportedLocales` derive from the catalog.

## Reused (not duplicated)
The template/messaging layer (`lib/templates/locale-resolver.ts`, `lib/preferred-lang.ts`,
`lib/geo/country-to-locale.ts`, dashboard template editors) already imports
`lib/locales.ts`, so it picks up the catalog automatically.

## Safety
- No payment, checkout, tracking, Twilio, or SendGrid changes.
- No schema/Prisma changes. No secrets touched.
- **Zero public behaviour change:** the enabled set resolves to the exact current 8
  locales in the same order; the 4 new locales are `enabled: false`, not routed, and
  need no `messages/*.json`.
- Typecheck: touched files carry **12 pre-existing errors, unchanged** (baseline == after).
  No new type errors introduced. Project builds with `TSC_COMPILE_ON_ERROR=true`.

## Reconciliation (done in this package)
Removed real duplication and fixed a latent bug class:
- **Bug fix:** `app/api/{cart/payment,donations,stripe/intent}/route.ts` and
  `app/api/auth/verify-email/route.ts` used 7-locale arrays **missing `de`**, so German
  donors' `donation.locale` was silently dropped to `null`. All now call `isValidLocale`
  from the catalog (adds `de`; payment processing untouched — only the stored locale string changes).
- **De-duplicated (pure lists → catalog):** `lib/seo.ts` `LOCALES`/`Locale` and
  `lib/campaign/share-labels.ts` `SHARE_LABEL_LOCALES`/`ShareLabelLocale` now derive from
  `SUPPORTED_LOCALES`. Their per-locale content maps (`Record<Locale,…>`) stay, so enabling
  a future public locale becomes a **compile error** until its content is filled in
  (type-enforced drift guard).

## Drift guard (done in this package)
`scripts/audit-locales.mjs` (`npm run locale:audit` / `locale:audit:strict`) parses the
enabled set from `lib/locales.ts` and fails when any content-keyed / non-importable source
is missing an enabled locale. Currently passing. It covers:
- `app/[locale]/layout.tsx` static `rawLocaleMessages` import map (must stay static).
- `lib/marketing/locales-countries.ts` (marketing list, intentionally reordered).
- `app/layout.tsx` JSON-LD `knowsLanguage`/`inLanguage`.
- `scripts/audit-i18n-messages.mjs` (`.mjs`, cannot import the TS catalog).
- Existence of `i18n/messages/<code>.json` per enabled locale.

## Still hand-maintained (out of this package — the guard/type system flags them)
- `app/[locale]/layout.tsx` static JSON import map (bundling requires static imports).
- date-fns locale maps in `success/[id]`, `BlogPageContent`, `campaigns/edit/[id]` (need a
  real date-fns locale import, not just a code).
- `lib/messages/subjects.ts` per-locale label chains; `lib/geo/country-to-locale.ts` country sets.

## To promote a future locale to public (checklist)
1. Add `messages/<code>.json` (full translation).
2. Add its `import` + `rawLocaleMessages` entry in `app/[locale]/layout.tsx`.
3. Flip `enabled: true` in `lib/locales.ts` `LOCALES`, and add the code to `SUPPORTED_LOCALES`.
4. Reconcile the sync-point files above (SEO, share-labels, marketing-countries, date-fns, geo).

## Testing
- `npx tsc --noEmit` — no new errors vs. baseline (12 == 12 in touched files).
- `npm run build` (`prisma generate && next build`) expected green (no schema/logic change).
- Manual: public `/ar`, `/en` … `/de` route unchanged; `/sq` `/it` `/nl` `/sv` remain
  locale-less → geo-redirected as before (not treated as valid public locales).
