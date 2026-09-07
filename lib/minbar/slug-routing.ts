import { LOCALIZED_SLUGS, SLUGS, type MinbarRoute } from "./routes";

/**
 * Localized-slug routing for the Minbar pages.
 *
 * `PRODUCTION_SEO_CONTRACT.md` requires `/{locale}/{localized-slug}` with an
 * independent slug per language, but the App Router's file tree can only carry
 * one path per page. So the pages live at their canonical (English) slugs and
 * the middleware rewrites a localized URL onto them:
 *
 *     /ar/المشاريع   →  rewrite  →  /ar/projects      (URL stays Arabic)
 *     /ar/projects   →  301      →  /ar/المشاريع      (one canonical URL)
 *
 * The redirect in the second direction matters as much as the rewrite: without
 * it both spellings would serve the same page and split its ranking, which is
 * the duplicate-content case the contract's Slug History section is about.
 *
 * Rewrites are computed from the same `LOCALIZED_SLUGS` table the links are
 * built from, so a slug can never be linked but unroutable.
 *
 * Two kinds of slug are handled, and the distinction matters:
 *
 *  - **Whole-path slugs**, where every segment is fixed — the Zangi course
 *    lives at `courses/nur-ad-din-zengi` and its Arabic spelling replaces both
 *    segments. These are matched first, and in full.
 *  - **Head slugs**, where only the first segment is fixed and what follows is
 *    dynamic — a project slug, an article slug. Only the head is mapped and the
 *    rest passes through untouched.
 *
 * Matching whole paths first is what keeps `/ar/دوراتنا/دورة-نور-الدين-زنكي`
 * from being half-translated into `/ar/courses/دورة-نور-الدين-زنكي`, which is
 * not a route.
 */

/** locale → localized whole path → canonical whole path. */
const PATH_REWRITES: Record<string, Record<string, string>> = {};
/** locale → canonical whole path → localized whole path. */
const PATH_REDIRECTS: Record<string, Record<string, string>> = {};
/** locale → localized first segment → canonical first segment. */
const HEAD_REWRITES: Record<string, Record<string, string>> = {};
/** locale → canonical first segment → localized first segment. */
const HEAD_REDIRECTS: Record<string, Record<string, string>> = {};

for (const [locale, overrides] of Object.entries(LOCALIZED_SLUGS)) {
  if (!overrides) continue;
  const pathToCanonical: Record<string, string> = {};
  const pathToLocalized: Record<string, string> = {};
  const headToCanonical: Record<string, string> = {};
  const headToLocalized: Record<string, string> = {};

  for (const [route, localized] of Object.entries(overrides)) {
    const canonical = SLUGS[route as MinbarRoute];
    if (!canonical || !localized || canonical === localized) continue;

    if (canonical.includes("/") || localized.includes("/")) {
      /* A slug with a fixed second segment. Both spellings are mapped whole. */
      pathToCanonical[localized] = canonical;
      if (!pathToLocalized[canonical]) pathToLocalized[canonical] = localized;
      continue;
    }

    if (localized === canonical) continue;
    headToCanonical[localized] = canonical;
    // Several routes share a canonical head (`projects` and `projectDetail`);
    // the first wins, and they map to the same localized head anyway.
    if (!headToLocalized[canonical]) headToLocalized[canonical] = localized;
  }

  PATH_REWRITES[locale] = pathToCanonical;
  PATH_REDIRECTS[locale] = pathToLocalized;
  HEAD_REWRITES[locale] = headToCanonical;
  HEAD_REDIRECTS[locale] = headToLocalized;
}

/** Split `/xx/a/b/c` into its locale and the segments after it. */
function parts(pathname: string): { locale: string; segments: string[] } | null {
  const [, locale, ...segments] = pathname.split("/");
  if (!locale || segments.length === 0 || !segments[0]) return null;
  return { locale, segments };
}

/**
 * Canonical pathname for a request, or `null` when the URL is already canonical.
 * Returns the path to rewrite to — the browser URL is unchanged.
 */
export function rewriteLocalizedPath(pathname: string): string | null {
  const split = parts(pathname);
  if (!split) return null;
  const { locale, segments } = split;
  const decoded = segments.map((segment) => decodeURIComponent(segment));

  /* Longest whole-path match first, so a two-segment slug wins over its own
     first segment. */
  for (let length = Math.min(decoded.length, 3); length >= 2; length -= 1) {
    const candidate = decoded.slice(0, length).join("/");
    const canonical = PATH_REWRITES[locale]?.[candidate];
    if (canonical) return `/${[locale, canonical, ...decoded.slice(length)].join("/")}`;
  }

  const canonicalHead = HEAD_REWRITES[locale]?.[decoded[0]];
  if (!canonicalHead) return null;
  return `/${[locale, canonicalHead, ...segments.slice(1)].join("/")}`;
}

/**
 * Localized pathname for a request that used the canonical slug, or `null` when
 * there is nothing to redirect to. Returns the path to 301 to.
 */
export function redirectToLocalizedPath(pathname: string): string | null {
  const split = parts(pathname);
  if (!split) return null;
  const { locale, segments } = split;

  for (let length = Math.min(segments.length, 3); length >= 2; length -= 1) {
    const candidate = segments.slice(0, length).join("/");
    const localized = PATH_REDIRECTS[locale]?.[candidate];
    if (localized) return `/${[locale, localized, ...segments.slice(length)].join("/")}`;
  }

  const localizedHead = HEAD_REDIRECTS[locale]?.[segments[0]];
  if (!localizedHead) return null;
  return `/${[locale, localizedHead, ...segments.slice(1)].join("/")}`;
}
