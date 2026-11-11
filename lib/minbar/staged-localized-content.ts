/**
 * Strict, read-only localized slug selection for the staged SEO migration.
 *
 * Existing pickLocaleSlug() intentionally falls back to English/base slugs.
 * Keep that behavior for old URLs while the migration is prepared; do not use
 * fallback slugs to announce a new indexable localized canonical URL.
 */
import type { SupportedLocale } from "../locales";

export interface ExactLocaleSlug {
  locale: string;
  slug?: string | null;
}

/** A language-specific URL is eligible only if its actual content is approved. */
export function exactPublishedLocaleSlug(input: {
  locale: SupportedLocale;
  baseSlug: string | null | undefined;
  translations: readonly ExactLocaleSlug[] | null | undefined;
  availableLocales: readonly string[] | null | undefined;
}): string | null {
  const { locale, baseSlug, translations, availableLocales } = input;
  if (!availableLocales?.includes(locale)) return null;
  const value = locale === "ar"
    ? baseSlug
    : translations?.find(row => row.locale === locale)?.slug;
  if (typeof value !== "string") return null;
  const normalized = value.trim().normalize("NFC");
  if (!normalized || normalized === "." || normalized === ".." ||
      /[\\/?#%\u0000-\u001f\u007f]/.test(normalized)) return null;
  return normalized;
}

export interface EntityLanguageTarget {
  entityId: string;
  locale: SupportedLocale;
  baseSlug: string | null | undefined;
  translations: readonly ExactLocaleSlug[] | null | undefined;
  availableLocales: readonly string[] | null | undefined;
}

/**
 * A navigation decision rather than an HTTP redirect.
 * No guessing using the source language, base slug, or ID as a public slug.
 */
export function exactLanguageSwitchTarget(
  input: EntityLanguageTarget,
  approvedRoutePrefix: string | null,
): { entityId: string; path: string } | null {
  if (!approvedRoutePrefix || !/^\/[a-z]{2}\//.test(approvedRoutePrefix)) return null;
  const prefixLocale = approvedRoutePrefix.split("/")[1];
  if (prefixLocale !== input.locale) return null;
  const slug = exactPublishedLocaleSlug(input);
  if (!slug) return null;
  return {
    entityId: input.entityId,
    path: `${approvedRoutePrefix.replace(/\/$/, "")}/${encodeURIComponent(slug)}`,
  };
}
