/** Numeric document dates use Latin digits. RTL locale formatters insert
 * direction marks between date parts; those reorder digits even inside an
 * isolated LTR PDF cell. Keep the locale's order and separators, not its marks. */
export function documentDate(date: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { day: "2-digit", month: "2-digit", year: "numeric" })
      .format(date).replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "");
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
