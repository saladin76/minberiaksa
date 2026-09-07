// Fallback order for localized records:
//   - locale === 'ar' (or empty): always use the base model fields (original Arabic);
//     translations are ignored even if an 'ar' row exists.
//   - any other locale: requested locale → English → base (Arabic) via `|| base.field`.
// Base model fields already hold the Arabic text.

const NO_MATCH_LOCALE = '__no_translation_match__';

export function translationLocaleWhere(locale: string): { locale: { in: string[] } } {
  if (!locale || locale === 'ar') {
    // Sentinel that won't match any real locale row — keeps Prisma `select`
    // shape consistent while returning an empty translations array.
    return { locale: { in: [NO_MATCH_LOCALE] } };
  }
  const set = new Set<string>([locale, 'en']);
  return { locale: { in: [...set] } };
}

export function pickTranslation<T extends { locale: string }>(
  translations: T[] | undefined | null,
  locale: string
): T | undefined {
  if (!translations?.length) return undefined;
  if (!locale || locale === 'ar') return undefined;
  const exact = translations.find(t => t.locale === locale);
  if (exact) return exact;
  return translations.find(t => t.locale === 'en');
}
