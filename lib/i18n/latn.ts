/**
 * Latin digits for every locale (UI/UX review, 2026-11-22): Arabic pages mixed Arabic-Indic and Latin digits
 * depending on which formatter drew the number. withLatn("ar") → "ar-u-nu-latn"; other locales already use Latin
 * digits; a tag that already names a Unicode extension is left as it is.
 */
export function withLatn(locale?: string | null): string | undefined {
  if (!locale) return undefined;
  return /-u-/.test(locale) ? locale : `${locale}-u-nu-latn`;
}
