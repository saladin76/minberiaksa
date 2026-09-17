import { LEGACY_SLUGS, SLUGS, type MinbarRoute } from "./routes";

/**
 * Redirects for the slugs the Minbar pages used to have.
 *
 * Every page now has one slug in every locale (`routes.ts`), so the file tree
 * IS the URL and nothing needs rewriting. What remains is the past: Arabic
 * once had its own spellings — `/ar/المشاريع`, `/ar/بيانات-الدفع` — and those
 * URLs are indexed and shared. A request for one is 301'd to the canonical
 * slug, so the ranking and the links carry over instead of dying.
 *
 * The match is locale-independent on purpose. The language switch keeps the
 * visitor on the same page by swapping only the locale prefix, so a visitor on
 * `/ar/بيانات-الدفع` who chose English arrived at `/en/بيانات-الدفع` — which
 * was a 404 when the Arabic spelling was only known under `/ar`. Any locale
 * prefix in front of a known legacy slug now redirects to that locale's
 * canonical URL:
 *
 *     /ar/بيانات-الدفع    →  301  →  /ar/checkout
 *     /en/بيانات-الدفع    →  301  →  /en/checkout
 *     /ar/المشاريع/x       →  301  →  /ar/projects/x
 *
 * Two kinds of slug are handled, and the distinction matters:
 *
 *  - **Whole-path slugs**, where every segment is fixed — the Zangi course
 *    lived at `دوراتنا/دورة-نور-الدين-زنكي`, replacing both segments. These
 *    are matched first, and in full.
 *  - **Head slugs**, where only the first segment is fixed and what follows is
 *    dynamic — a project slug, an article slug. Only the head is mapped and
 *    the rest passes through untouched.
 *
 * Matching whole paths first keeps `/ar/دوراتنا/دورة-نور-الدين-زنكي` from
 * being half-translated into `/ar/courses/دورة-نور-الدين-زنكي`, a non-route.
 */

/** Legacy whole path → canonical whole path, whichever locale had it. */
const PATH_REDIRECTS: Record<string, string> = {};
/** Legacy first segment → canonical first segment. */
const HEAD_REDIRECTS: Record<string, string> = {};

for (const overrides of Object.values(LEGACY_SLUGS)) {
  if (!overrides) continue;
  for (const [route, legacy] of Object.entries(overrides)) {
    const canonical = SLUGS[route as MinbarRoute];
    if (!canonical || !legacy || canonical === legacy) continue;

    if (canonical.includes("/") || legacy.includes("/")) {
      /* A slug with a fixed second segment. Both spellings are mapped whole. */
      if (!PATH_REDIRECTS[legacy]) PATH_REDIRECTS[legacy] = canonical;
      continue;
    }
    // Several routes share a head (`projects` and `projectDetail`); they map to
    // the same canonical head anyway, so the first wins.
    if (!HEAD_REDIRECTS[legacy]) HEAD_REDIRECTS[legacy] = canonical;
  }
}

/** Split `/xx/a/b/c` into its locale and the segments after it. */
function parts(pathname: string): { locale: string; segments: string[] } | null {
  const [, locale, ...segments] = pathname.split("/");
  if (!locale || segments.length === 0 || !segments[0]) return null;
  return { locale, segments };
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Canonical pathname for a request that used a legacy slug, or `null` when
 * there is nothing to redirect. Returns the path to 301 to; segments after the
 * matched slug pass through as they came.
 */
export function redirectLegacyPath(pathname: string): string | null {
  const split = parts(pathname);
  if (!split) return null;
  const { locale, segments } = split;
  const decoded = segments.map(decode);

  /* Longest whole-path match first, so a two-segment slug wins over its own
     first segment. */
  for (let length = Math.min(decoded.length, 3); length >= 2; length -= 1) {
    const candidate = decoded.slice(0, length).join("/");
    const canonical = PATH_REDIRECTS[candidate];
    if (canonical) return `/${[locale, canonical, ...segments.slice(length)].join("/")}`;
  }

  const canonicalHead = HEAD_REDIRECTS[decoded[0]];
  if (!canonicalHead) return null;
  return `/${[locale, canonicalHead, ...segments.slice(1)].join("/")}`;
}
