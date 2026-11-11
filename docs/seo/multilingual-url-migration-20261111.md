# Multilingual public URL migration — implementation contract (2026-11-11)

Status: **DESIGN / BLOCKED ON INVENTORY; NOT APPROVED FOR DEPLOYMENT**.

## Scope and source facts

- Production public sitemap snapshot dated 2026-11-11: 1,398 URLs, 6 sitemap shards, 19 locales, zero fetch errors.
- Project detail paths in sitemap: ar 38, tr 38, en 38, fr 29. Article detail paths: ar 258, tr/en/fr 0. These counts **do not prove missing content**: translated slugs differ, and indexability may differ.
- Live sampled project pages currently use `/{locale}/bagislar/{localizedSlug}` as self-canonical and advertise locale-specific hreflang alternates.
- `lib/minbar/routes.ts` explicitly encodes one generic slug per page across locales; `lib/minbar/slug-routing.ts` already provides legacy redirects.
- PR #200 implements a read-only URL inventory and ad-query audit, and overlaps the migration prerequisites. Reuse its findings and coordinate against the release manager.

## Immutable boundaries

1. No production writes, deployments, database migration, or data mutations from this documentation PR.
2. Never rename `/api`, `/dashboard`, checkout, cart, auth, callback, webhook, success, receipt, or donation-id-bearing transaction endpoints as part of public SEO path migration. All in-flight bank callback destinations stay stable.
3. Do not change campaign/project IDs, settlement, attribution, cart amounts/currency, or subscription references.
4. Do not remove a language or advertise a translation until a published, indexable and semantically valid localized page is verified.
5. Do not turn a currently valid independently serving public page (notably `/{locale}/campaigns`) into a catalog redirect without a signed content-equivalence decision.
6. Preserve URL tracking parameters including repeated `utm_*`, `gclid`, `gbraid`, `wbraid`, `fbclid`, referral and campaign IDs; never leak payment secrets via redirect query propagation.

## Architecture

- `publicRouteFor(routeKey, locale)` is the unique source for **public indexable static** page prefixes. Use a locale-specific dictionary for all 19 locales with human review and explicit eligibility; reject collisions, missing translations and ambiguous route keys. No automatic fallback-to-Turkish/English slugs advertised as translated URLs.
- `contentUrl({type, entityId, locale})` resolves the current **published localized slug by immutable entity ID**, not by translating a URL segment. Use for projects, categories, posts and switch-language UX.
- Maintain a durable append-only **URL aliases registry**, unique by normalized host + decoded/encoded-safe path, mapping alias -> immutable content ID + requested locale -> final canonical URL. Record existing public sitemap URLs, marketing destinations and historical redirect sources. Store provenance and created-at; never silently overwrite alias ownership.
- Router handling order: reserved/sensitive routes -> exact historic alias -> verified localized content router -> safe legacy generic route -> ordinary 404. Return a single 301/308 directly to final destination; no rewrite with self-canonical legacy URL.
- Encoded unicode, Arabic punctuation, Turkish dotted/dotless i, French accents, slash normalization and trailing slashes must be collision-safe, without normalization that swaps entity ownership.
- Preserve safe raw query ordering/duplicates where supported and avoid including sensitive tokens in logs.
- Sitemap, canonical, OG, structured data and hreflang must be generated from the **same resolved canonical URL**; include only self-canonical 200 indexable translated pages. Verify reciprocal hreflang and x-default; omit unavailable translations.
- Localized public links replace generic hardcoded `/bagislar` references across navigation, cards, share previews, editor and advertising link builder. Legacy URLs remain redirect-only.
- Do **not** make a global `/bagislar` string replacement: generic routes and transaction integrations differ.

## Migration steps

1. Freeze and export a machine-readable route inventory with source URL, current status, final URL, canonical, content type, entity ID, locale, index eligibility, ad-account destination usage and ownership.
2. Validate full 19-locale terminology with a language-native reviewer. Draft examples only: ar `/المشاريع`, tr `/bagislar`, en `/donate`, fr `/faire-un-don`. Final names must be approved after validating user intent (project catalog versus donate action) and collisions.
3. Implement and unit-test canonical route registry and entity-ID-based URL resolution on a **separate code PR**. Implement alias storage and migration/backfill with dry-run collision reports.
4. Implement tested one-hop old->new redirects, then replace internal links and generate SEO tags and sitemap from the registry. Ensure current indexed page and active paid-ad URLs remain reachable.
5. Test all 1,398 sitemap-snapshot URLs **plus** historical aliases and paid-ad destination exports, including query-string preservation and cross-language content identity.
6. Run staging E2E for navigation, language switch, share cards, category/project/article, ad landing, cart/checkout with sandbox-only payments. Do not use real bank transactions.
7. Release only after financial/security gates and release-manager signoff; monitor 404s, crawl stats, redirects and Search Console afterward.

## Acceptance gates

- No alias loss; each old URL resolves through **exactly one** 301/308 to a tested matching page.
- Every new indexable canonical URL returns 200 and self-canonical; legacy URLs absent from sitemap.
- Every hreflang target is independently 200, self-canonical, indexable and reciprocates the correct entity; no false language claims.
- Paid ad destination query values survive intact, including repeated parameters.
- Content ID is invariant on locale switch, with safe handling for missing translations.
- No unexpected change to transaction routes or payment flow behavior.
- Unit/integration/build/CI and staged E2E evidence linked to exact HEAD SHA; post-deploy live audit required before marking DONE.

## Known blockers

- Source inventory file was collected on VPS at `/tmp/minber-public-urls-20261111.json` but is not in this GitHub branch; do not claim all URLs individually validated.
- Missing complete past URL alias list and live active Google/Meta destination exports.
- No approved native-localized route dictionary covering 19 languages.
- No validated DB content ID to translated slug migration/backfill plan.
- No CI or live post-deploy verification for the migration code.

**This document creates an implementation gate only; it does not implement URL redirects or deploy a site change.**
