/** English country name from ISO 3166-1 alpha-2 (for DB when only a code is known). */
export function countryNameFromIsoCode(code: string, locale = "en"): string {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c) || c === "XX") return code.trim();
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(c) ?? c;
  } catch {
    return c;
  }
}
