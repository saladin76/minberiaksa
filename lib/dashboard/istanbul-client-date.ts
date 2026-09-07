const ISTANBUL_TIME_ZONE = "Europe/Istanbul";

const istanbulDateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ISTANBUL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's YYYY-MM-DD in the Istanbul calendar (drop-in for `toISOString().slice(0,10)`). */
export function istanbulTodayKey(now: Date = new Date()): string {
  return istanbulDateKeyFormatter.format(now);
}

/** Subtract calendar days in the Istanbul calendar and return the resulting YYYY-MM-DD. */
export function istanbulAddCalendarDaysKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Format a YYYY-MM-DD Istanbul calendar key as a human label without timezone
 * re-interpretation. `new Date("2026-05-20").toLocaleDateString(...)` parses
 * the string as UTC midnight, then converts to the browser's local TZ — this
 * helper instead reads the calendar components directly so the label always
 * matches the bar's underlying day.
 */
export function formatIstanbulDateKeyLabel(
  dateKey: string,
  locale: string,
  options: Intl.DateTimeFormatOptions
): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(anchor);
}
