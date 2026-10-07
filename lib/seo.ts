import type { Metadata } from "next";
import { SUPPORTED_LOCALES, isValidLocale, type SupportedLocale } from "@/lib/locales";
import { MINBAR_LOCALE_SEO, MINBAR_OG_LOCALES } from "@/lib/seo-minbar.generated";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.minberiaksa.org").replace(/\/$/, "");

/**
 * Only the production deployment is meant to be found. Preview and
 * development deployments say noindex three ways  the `X-Robots-Tag` header
 * in `next.config.ts`, `app/robots.ts`, and the root layout's metadata  and
 * all three key off this (`DEPLOYED_VS_DESIGN_AUDIT.md` § P1.1).
 */
export const isProductionDeployment = (): boolean => process.env.VERCEL_ENV === "production";
export const SITE_NAME = "Minberiaksa";
export const OG_IMAGE = `${SITE_URL}/og-image.jpg`;

// Locales derive from the single source of truth (`lib/locales.ts`). The
// per-locale maps below are `Record<Locale, …>`, so enabling a new public locale
// becomes a compile error here until its SEO/OG content is filled in  that is the
// intended drift guard for translated content.
export const LOCALES = SUPPORTED_LOCALES;
export type Locale = SupportedLocale;

export const OG_LOCALE_MAP: Record<Locale, string> = MINBAR_OG_LOCALES;

type LocaleSEO = {
  siteName: string;
  title: string;
  description: string;
  keywords: string[];
  titleTemplate: string;
  campaigns: { title: string; description: string };
  about: { title: string; description: string };
  contact: { title: string; description: string };
  blog: { title: string; description: string };
};

/**
 * Institutional SEO for every public locale.
 *
 * All 19 come from `lib/seo-minbar.generated.ts`, which
 * `scripts/generate-minbar-seo.mjs` derives from the handoff's translated
 * bundles. There used to be a second, hand-written source here for the
 * original 8 locales, and it still described the organisation's retired
 * regional programme; because `buildPageMetadata()` falls back to
 * `seo.keywords`, those keywords reached every page that did not pass its
 * own. One source, one generator, and
 * `tests/integration-settings/seo-legacy-contamination.test.ts` failing the
 * build if the old terms return  it scans this file's text too, which is why
 * the programme is not named here (`DEPLOYED_VS_DESIGN_AUDIT.md` § P0.3).
 */
export const LOCALE_SEO: Record<Locale, LocaleSEO> = MINBAR_LOCALE_SEO;

/** Build hreflang alternates for a given path (e.g. "/campaigns") */
export function buildHreflang(path: string, currentLocale: string) {
  const normalizedPath = path === "/" ? "" : path;
  const canonicalLocale: Locale = isValidLocale(currentLocale) ? currentLocale : "ar";
  const languages: Record<string, string> = {};
  for (const locale of LOCALES) {
    languages[locale] = `${SITE_URL}/${locale}${normalizedPath}`;
  }
  languages["x-default"] = `${SITE_URL}/ar${normalizedPath}`;
  return {
    canonical: `${SITE_URL}/${canonicalLocale}${normalizedPath}`,
    languages,
  };
}

/**
 * Build hreflang/canonical alternates for a slug-routed entity (campaign, post,
 * category) where each locale may have its OWN translation slug.
 *
 * Each locale's URL uses its own per-locale slug when present, falling back to
 * the entity's base slug, then to `fallback` (typically the entity id).
 *
 * Example: an AR campaign with slug "زكاة-القدس" and an EN translation slug
 * "pay-your-zakat-at-al-quds" yields:
 *   hreflang="ar" → /ar/campaign/زكاة-القدس
 *   hreflang="en" → /en/campaign/pay-your-zakat-at-al-quds
 *
 * Without this, Google sees the same slug under every hreflang and may drop
 * the per-locale variants from the index.
 */
export function buildLocalizedAlternates(args: {
  /** URL prefix without trailing slash, e.g. "/campaign", "/blog", "/category" */
  basePath: string;
  /** Default-locale (Arabic) slug from the entity row */
  baseSlug?: string | null;
  /** Per-locale translation rows; only `locale` and optional `slug` are used */
  translations?: Array<{ locale: string; slug?: string | null }> | null;
  /** Used when neither a translation slug nor base slug is set (typically the entity id) */
  fallback: string;
  /** Locale of the page we're rendering  drives `canonical` */
  currentLocale: string;
  /** Emit hreflang only for locales with genuinely equivalent localized content. */
  availableLocales?: string[];
}): { canonical: string; languages: Record<string, string> } {
  const { basePath, baseSlug, translations, fallback, currentLocale, availableLocales } = args;
  const slugFor = (loc: string): string => {
    const t = translations?.find((tt) => tt.locale === loc && tt.slug);
    return t?.slug || baseSlug || fallback;
  };
  const url = (loc: string): string =>
    `${SITE_URL}/${loc}${basePath}/${encodeURIComponent(slugFor(loc))}`;

  const allowed = availableLocales?.length
    ? LOCALES.filter((locale) => availableLocales.includes(locale))
    : LOCALES;
  const languages: Record<string, string> = {};
  for (const locale of allowed) languages[locale] = url(locale);
  languages["x-default"] = url("ar");
  const canonicalLocale = allowed.includes(currentLocale as Locale)
    ? currentLocale
    : "ar";
  return { canonical: url(canonicalLocale), languages };
}

/** Build full per-page metadata (layout/page generateMetadata helper) */
/**
 * Scripts whose characters are wide and whose words carry no spaces. A search
 * result truncates by rendered width, so the same character budget that suits
 * Arabic or Latin overruns in Japanese and Chinese.
 */
const DENSE_SCRIPTS = new Set(["ja", "zh"]);
/** Sentence and clause enders worth cutting at, in the scripts that use them. */
const CJK_BREAKS = /[。、，．！？；：」』）]/;

/**
 * Clip a description to something a search engine will show whole.
 *
 * Every metadata route used to do its own `.slice(0, 165)`, which cuts mid-word
 * ("…للأسر المقدس"), leaves a dangling space before the ellipsis, ignores that a
 * Japanese description is far wider per character, and happily ships a stray
 * `<em>` from CMS copy. This does the job once:
 *
 *  · HTML tags and collapsed whitespace out first, so the length counts text;
 *  · dense scripts (ja/zh) get a shorter budget and break on their own
 *    punctuation rather than on spaces they do not have;
 *  · everything else backs off to the last word boundary, dropping any trailing
 *    punctuation the cut left behind;
 *  · the ellipsis is only added when something was actually removed.
 */
export function clipSeoDescription(text: string, locale?: string, max?: number): string {
  const clean = String(text ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const dense = DENSE_SCRIPTS.has(String(locale ?? "").toLowerCase());
  const limit = max ?? (dense ? 90 : 160);
  if (clean.length <= limit) return clean;

  /* Cut one character early so there is room for the ellipsis inside the budget. */
  const window = clean.slice(0, limit - 1);
  if (dense) {
    let cut = -1;
    for (let i = window.length - 1; i >= Math.floor(limit * 0.6); i--) {
      if (CJK_BREAKS.test(window[i])) { cut = i + 1; break; }
    }
    return (cut > 0 ? window.slice(0, cut) : window).trim() + "…";
  }
  const lastSpace = window.lastIndexOf(" ");
  /* A single unbroken token longer than the budget (a URL, a long compound) has no
     word boundary to fall back to; cutting it mid-way beats returning nothing. */
  const body = lastSpace > limit * 0.5 ? window.slice(0, lastSpace) : window;
  return body.replace(/[\s،,;:.!?—–-]+$/u, "") + "…";
}

export function buildPageMetadata(
  locale: string,
  overrides: {
    title: string;
    description: string;
    path: string;
    image?: string;
    keywords?: string[];
    type?: "website" | "article";
    alternates?: { canonical: string; languages: Record<string, string> };
    robots?: Metadata["robots"];
  }
): Metadata {
  const seo = LOCALE_SEO[locale as Locale] ?? LOCALE_SEO.en;
  const image = overrides.image ?? OG_IMAGE;
  const alternates = overrides.alternates ?? buildHreflang(overrides.path, locale);
  /* Clipped here, once, for every page that goes through this funnel  pages pass
     their full copy and no longer each carry a hand-written `.slice(0, 165)`. */
  const description = clipSeoDescription(overrides.description, locale);

  return {
    title: overrides.title,
    description,
    keywords: overrides.keywords ?? seo.keywords,
    alternates,
    ...(overrides.robots ? { robots: overrides.robots } : {}),
    openGraph: {
      title: overrides.title,
      description,
      url: alternates.canonical,
      siteName: seo.siteName,
      locale: OG_LOCALE_MAP[locale as Locale] ?? "en_US",
      alternateLocale: LOCALES.filter((candidate) => candidate !== locale).map(
        (candidate) => OG_LOCALE_MAP[candidate],
      ),
      type: overrides.type ?? "website",
      images: [{ url: image, width: 1200, height: 630, alt: overrides.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: overrides.title,
      description,
      images: [image],
    },
  };
}
