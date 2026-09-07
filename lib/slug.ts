// Slug utilities — generates URL-safe slugs (preserves Arabic letters),
// detects MongoDB ObjectIds, and ensures uniqueness across a model.
import type { PrismaClient } from "@prisma/client";

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

export function isObjectId(value: string): boolean {
  return OBJECT_ID_RE.test(value);
}

/**
 * Convert any string into a URL-friendly slug.
 *  - lowercases ASCII
 *  - keeps unicode letters/numbers (so Arabic stays readable)
 *  - replaces whitespace with `-`
 *  - strips punctuation that's noisy in URLs
 *  - collapses repeated dashes, trims leading/trailing dashes
 *  - truncates at MAX_LEN
 */
export function slugify(input: string, maxLen = 80): string {
  if (!input) return "";
  let s = String(input).normalize("NFKD").trim().toLowerCase();
  // strip combining marks (Latin diacritics + Arabic harakat); keeps base letters intact
  s = s.replace(/\p{M}+/gu, "");
  // replace whitespace and underscores with single dash
  s = s.replace(/[\s_]+/g, "-");
  // drop characters that aren't unicode letters/numbers/dashes
  s = s.replace(/[^\p{L}\p{N}-]+/gu, "");
  // collapse repeated dashes
  s = s.replace(/-+/g, "-");
  // trim leading/trailing dashes
  s = s.replace(/^-+|-+$/g, "");
  if (s.length > maxLen) s = s.slice(0, maxLen).replace(/-+$/g, "");
  return s;
}

type Delegate = {
  findFirst: (args: any) => Promise<{ id: string } | null>;
};

/**
 * Generate a unique slug for `delegate` based on `base`.
 *  - normalises the base via slugify()
 *  - if the result is empty (e.g. only punctuation), uses the fallback prefix
 *  - if it collides, appends `-2`, `-3`, ... until free
 *  - records currentId so updating an existing row doesn't see itself as a clash
 */
export async function generateUniqueSlug(
  delegate: Delegate,
  base: string,
  options: { fallbackPrefix?: string; currentId?: string } = {}
): Promise<string> {
  const { fallbackPrefix = "item", currentId } = options;
  let slug = slugify(base);
  if (!slug) slug = `${fallbackPrefix}-${Date.now().toString(36)}`;

  const candidate = slug;
  let suffix = 1;
  // Try the bare slug first, then append -2, -3, ...
  // (suffix=1 means "no suffix" iteration)
  while (true) {
    const value = suffix === 1 ? candidate : `${candidate}-${suffix}`;
    const where: any = { slug: value };
    if (currentId) where.id = { not: currentId };
    const existing = await delegate.findFirst({ where, select: { id: true } });
    if (!existing) return value;
    suffix += 1;
    if (suffix > 1000) {
      // Pathological collision — fall back to a unique-by-time suffix
      return `${candidate}-${Date.now().toString(36)}`;
    }
  }
}

/** Build a Prisma `where` that matches by ObjectId or slug. */
export function whereByIdOrSlug(key: string): { id: string } | { slug: string } {
  return isObjectId(key) ? { id: key } : { slug: key };
}

/**
 * Build a Prisma `where` that matches an entity by ObjectId, base slug, or
 * by a translation slug for the given locale. Returns a clause shaped:
 *   - { id }                                                           if key is an ObjectId
 *   - { OR: [{ slug }, { translations: { some: { locale, slug } } }] } otherwise
 *
 * `translationsRelationName` defaults to `translations` (matches every model
 * in this schema). Pass a different name only if your relation differs.
 */
export function whereByIdOrLocaleSlug(
  key: string,
  locale: string,
  translationsRelationName = "translations"
): Record<string, unknown> {
  if (isObjectId(key)) return { id: key };
  return {
    OR: [
      { slug: key },
      { [translationsRelationName]: { some: { locale, slug: key } } },
    ],
  };
}

/**
 * Like `whereByIdOrLocaleSlug` but matches a translation slug from ANY locale.
 * Use this when resolving a URL whose slug may belong to a different locale than
 * the page is rendering — e.g. after a language switch keeps the previous
 * locale's slug. Pair with `pickLocaleSlug` to compute the canonical slug for
 * the current locale and redirect when they differ.
 */
export function whereByIdOrAnyLocaleSlug(
  key: string,
  translationsRelationName = "translations"
): Record<string, unknown> {
  if (isObjectId(key)) return { id: key };
  return {
    OR: [
      { slug: key },
      { [translationsRelationName]: { some: { slug: key } } },
    ],
  };
}

/**
 * Pick the URL slug to display for a localized entity.
 * Prefers the locale-specific translation slug, then base slug, then null.
 *
 * For `ar`, the canonical copy lives on the base model (e.g. Campaign.title / Campaign.slug);
 * there is no separate Arabic translation row. The Arabic URL must use `baseSlug`, not
 * another locale’s translation slug.
 *
 * `translations` is expected to be the array shape used across this codebase:
 *   [{ locale: string, slug?: string | null, ... }]
 */
export function pickLocaleSlug(
  baseSlug: string | null | undefined,
  translations: Array<{ locale: string; slug?: string | null }> | null | undefined,
  locale: string
): string | null {
  if (locale === "ar") {
    if (nonEmpty(baseSlug)) return baseSlug as string;
    const legacyAr = translations?.find((t) => t.locale === "ar" && nonEmpty(t.slug));
    if (legacyAr && nonEmpty(legacyAr.slug)) return legacyAr.slug as string;
    return null;
  }

  if (translations && translations.length) {
    const exact = translations.find((t) => t.locale === locale && nonEmpty(t.slug));
    if (exact && nonEmpty(exact.slug)) return exact.slug as string;
    // English fallback for non-AR locales only (never for `ar` — see above).
    if (locale !== "en") {
      const en = translations.find((t) => t.locale === "en" && nonEmpty(t.slug));
      if (en && nonEmpty(en.slug)) return en.slug as string;
    }
  }
  return nonEmpty(baseSlug) ? (baseSlug as string) : null;
}

function nonEmpty(s: unknown): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

/**
 * Build a Record<locale, slug> from a base slug + translation rows. Locales
 * without a per-locale slug fall back to the base slug. Useful for the
 * dashboard link generator so it can pick the correct slug per selected locale.
 */
export function slugByLocaleMap(
  baseSlug: string | null | undefined,
  translations: Array<{ locale: string; slug?: string | null }> | null | undefined,
  supportedLocales: string[]
): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  for (const loc of supportedLocales) {
    map[loc] = pickLocaleSlug(baseSlug, translations, loc);
  }
  return map;
}

/**
 * Generate a slug unique within a single locale's translation rows.
 *
 * Pass the *translation* delegate (e.g. prisma.campaignTranslation) and the
 * field name on the translation that holds the parent FK (e.g. "campaignId")
 * so we can exclude the current translation when re-saving.
 */
export async function generateUniqueLocaleSlug(
  translationDelegate: Delegate,
  base: string,
  options: {
    locale: string;
    fallbackPrefix?: string;
    /** Exclude this translation row when checking — used during updates. */
    currentTranslationId?: string;
  }
): Promise<string> {
  const { locale, fallbackPrefix = "item", currentTranslationId } = options;
  let slug = slugify(base);
  if (!slug) slug = `${fallbackPrefix}-${Date.now().toString(36)}`;

  const candidate = slug;
  let suffix = 1;
  while (true) {
    const value = suffix === 1 ? candidate : `${candidate}-${suffix}`;
    const where: any = { locale, slug: value };
    if (currentTranslationId) where.id = { not: currentTranslationId };
    const existing = await translationDelegate.findFirst({
      where,
      select: { id: true },
    });
    if (!existing) return value;
    suffix += 1;
    if (suffix > 1000) {
      return `${candidate}-${Date.now().toString(36)}`;
    }
  }
}

/**
 * Resolve user-provided slug input.
 *  - returns null if input is empty/blank → caller should auto-generate
 *  - returns slugified value otherwise (so admins can't accidentally save spaces/uppercase)
 */
export function normalizeUserSlug(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const cleaned = slugify(s);
  return cleaned || null;
}

// Convenience helpers for the four slugged models
export const slugDelegates = (prisma: PrismaClient) => ({
  campaign: prisma.campaign,
  category: prisma.category,
  post: prisma.post,
  postCategory: prisma.postCategory,
});
