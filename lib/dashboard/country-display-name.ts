/** Localized country/region name for an ISO 3166-1 alpha-2 code (e.g. from donation snapshot). */
export function getCountryDisplayNameFromCode(
  code: string | null | undefined,
  locale: string = "ar"
): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "—";
  const upper = code.toUpperCase();
  try {
    const dn = new Intl.DisplayNames([locale], { type: "region" });
    return dn.of(upper) ?? upper;
  } catch {
    return upper;
  }
}
