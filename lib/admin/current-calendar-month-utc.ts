import {
  addIstanbulCalendarDays,
  formatIstanbulDateKey,
  istanbulDateKeysToUtcRange,
} from "./istanbul-calendar";

/** @deprecated Use `getCurrentCalendarMonthIstanbulRange` — the dashboard's
 *  "شهر" filter emits Istanbul date keys, so a UTC-aligned month starts 3 hours
 *  later than the filter's start and undercounts donations. */
export function getCurrentCalendarMonthUtcRange(now: Date = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const monthStart = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
  return { monthStart, monthEnd };
}

/**
 * Start/end of the calendar month containing `now` in the Istanbul time zone,
 * returned as UTC `Date`s ready for Prisma `createdAt: { gte, lte }` filters.
 *
 * The dashboard's شهر preset (`getPeriodDateKeys(period="month", …)`) emits
 * `YYYY-MM-01 → todayIstanbul`, which converts to Istanbul midnight on the
 * first (= 21:00 UTC on the last day of the previous month). This helper
 * mirrors that so the "إيرادات شهر …" hero card and the filter-driven
 * "إيرادات ناجحة (شهر)" card agree exactly.
 */
export function getCurrentCalendarMonthIstanbulRange(now: Date = new Date()) {
  const todayKey = formatIstanbulDateKey(now);
  const [year, month] = todayKey.split("-");
  const monthStartKey = `${year}-${month}-01`;
  // Last day of this month = day-before the 1st of next month, computed via
  // Istanbul-calendar arithmetic so daylight-savings shifts don't skew it.
  const [ny, nm] = [Number(year), Number(month)];
  const nextMonthFirstKey = `${nm === 12 ? ny + 1 : ny}-${String(nm === 12 ? 1 : nm + 1).padStart(2, "0")}-01`;
  const monthEndKey = addIstanbulCalendarDays(nextMonthFirstKey, -1);
  const { startDate, endDate } = istanbulDateKeysToUtcRange(monthStartKey, monthEndKey);
  return { monthStart: startDate, monthEnd: endDate };
}

const LOCALE_MAP: Record<string, string> = {
  ar: "ar-SA",
  en: "en-US",
  fr: "fr-FR",
  es: "es-ES",
  pt: "pt-BR",
  tr: "tr-TR",
  id: "id-ID",
};

/** @deprecated Use `formatIstanbulCalendarMonthLong` — see the deprecation note
 *  on `getCurrentCalendarMonthUtcRange`. */
export function formatUtcCalendarMonthLong(date: Date = new Date(), locale: string) {
  const intlLocale = (LOCALE_MAP[locale] ?? locale) || "en-US";
  return new Intl.DateTimeFormat(intlLocale, { month: "long", timeZone: "UTC" }).format(date);
}

/** Localized full month name for the Istanbul calendar month containing `date`
 *  (aligns with `getCurrentCalendarMonthIstanbulRange` and the شهر filter). */
export function formatIstanbulCalendarMonthLong(date: Date = new Date(), locale: string) {
  const intlLocale = (LOCALE_MAP[locale] ?? locale) || "en-US";
  return new Intl.DateTimeFormat(intlLocale, { month: "long", timeZone: "Europe/Istanbul" }).format(date);
}
