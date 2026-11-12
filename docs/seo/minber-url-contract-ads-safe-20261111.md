# Minber Al-Aqsa URL architecture — ads-safe contract

Status: audit / proposed governance only. **No published slug is renamed and no live ad is modified in this branch.**

## Sources of truth and required evidence

1. `lib/minbar/routes.ts`: static public paths, legacy route dictionary and noindex classification.
2. `lib/minbar/slug-routing.ts`, `proxy.ts`, `next.config.ts`: early redirects and old links; preserve original request query (UTM, ad click IDs, referral and currency).
3. CMS data models (`Campaign`, `Category`, `SuperCategory`, `Post`, `PostCategory`) and their localized slugs / `previousSlugs`; do not infer real CMS slugs from seed data.
4. `lib/sitemap.ts` and `/sitemap.xml` shards: publicly indexable URL inventory, **not** a complete list of the public site (noindex and redirects excluded).
5. Actual Google Ads / Meta / TikTok / X / email / WhatsApp campaign destination exports and Search Console landing pages: **mandatory** before any URL migration; not available from source code alone.
6. Live server check with `node scripts/qa-public-url-inventory.mjs --check --limit=80` from a safe copy of the audited source. It makes bounded public HTTP reads only, prints JSON, does not connect to DB or call payment endpoints. Store outputs as an access-controlled QA report.

## Canonical public route families

| Kind | Existing canonical structure | SEO and migration rule |
|---|---|---|
| Static pages | `/{locale}/{slug from SLUGS}` | Match `routes.ts`; never rename a published path without old->new redirect |
| Project detail | `/{locale}/bagislar/{localized-project-slug}` | Active, published record; base/translation/previousSlug or ID resolves to canonical locale slug |
| Major section | `/{locale}/bagislar/{localized-super-category-slug}` | Same pathname shape as project, super category has first lookup priority |
| Project category | `/{locale}/category/{localized-category-slug}` | Preserve old slugs and category templates redirecting to canonical Aqsa / zakat pages |
| Articles | `/{locale}/blog/{localized-article-slug}` | Published only; 308 with full original query when alias slug differs |
| Article category | `/{locale}/blog/category/{category-slug}` | Keep existing category consolidation redirects |
| Legacy campaign catalogue | `/{locale}/campaigns` | **Real page**. Do not remove or redirect blindly; `/donates` links here |
| Bank transfer | `/{locale}/bank-transfer` | Real public page; preserve even if bank-accounts content overlaps |
| Donor/payment/receipts | `/{locale}/account|cart|checkout|success|payment-*|receipt|...` | Never bulk-redirect, include in sitemap or public audit; require financial-security review |

### Explicit legacy ad paths already defined

`/ar/ghr`, `/ar/monthly-donate`, `/ar/donates`, `/donates`, and older `/{locale}/projects` variants remain accepted. Preserve query parameters on every hop.

**The source alone cannot certify that all live ads use only the listed paths.** A full campaign destination export is required to complete the ad compatibility inventory.

## Migration rules

- **Freeze URL renames** until the sitemap, database content export (read-only), active-ad URLs and Search Console click/landing data are joined into a verified mapping with content IDs and destinations.
- Store each mapping with original complete URL, destination URL, source type, content ID, applicable locales, status, attribution parameters, and validation evidence.
- For a true rename, accept old route and former localized slug indefinitely (301/308); preserve path segments and all query parameters. Never redirect a deleted project to a random current project or silently replace campaign-specific landing pages with the homepage.
- A prior slug must not be reissued to a different project/category; reject collisions before write. If old slug is deliberately retired, retain a safe and semantically relevant fallback rather than a 404.
- Rebuild the **link generator** from the same canonical route map and `pickLocaleSlug` as the server pages. It must not invent missing translations or publish unpublished content.
- Public canonical must be self-consistent for its indexable locale. Hreflang includes only genuinely available translated equivalents and reciprocal links, with a valid `x-default`.
- A source old URL should redirect once to the final destination; avoid redirect chains, loops, duplicate redirect sources and paths requiring donor tokens.
- Recalculate sitemaps from current published contents only; no transaction, donor, dashboard, noindex or stale removed URL may be published as a canonical destination.
- Preserve payment gateway callbacks and other signed return URLs exactly; altering their shape is a separate finance release and not an SEO change.
- Use browser/network check to confirm `utm_source`, `utm_campaign`, `utm_content`, `gclid`, `fbclid`, referral and currency survive redirects and attribution.
- Rollback plan: restore previous route handlers if any real paid-ad URL becomes 404/500, tracking query disappears, wrong page opens or conversion attribution changes. Do not edit active ads before verified release.

## Acceptance ledger (do not mark complete without evidence)

| Gate | State |
|---|---|
| Source route map review | Reviewed |
| Automated public sitemap collector and known ad probes | Implemented, not run on live VPS |
| All published database URLs across locales | **Not yet inventoried from live database** |
| All active advertising URLs, Search Console pages | **Not yet supplied or exported** |
| Full old-to-new redirect mapping | **Not complete; no wholesale migration authorized** |
| Exact-HEAD CI and script regression tests | Pending check |
| Live HTTP 200, single-hop 301/308, UTM retention, canonical/hreflang | Await read-only server audit |
| Marketing/security release approval | Not granted |

This is a staged migration contract, not confirmation that all existing paid ad URLs have been tested or changed.
