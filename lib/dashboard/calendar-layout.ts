/** Date keys represent the reporting calendar, independent of browser/server
 * timezone. UTC noon is only a stable carrier for formatting that date. */
export function calendarMonthLayout(month: string) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, number] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return {
    leading: new Date(Date.UTC(year, number - 1, 1)).getUTCDay(),
    days: Array.from({ length: count }, (_, i) => {
      const day = i + 1, date = `${month}-${String(day).padStart(2, "0")}`;
      return { day, date, weekday: new Date(`${date}T12:00:00Z`).getUTCDay() };
    }),
  };
}
const weekdayFormats = new Map<string, Intl.DateTimeFormat>();
const fullDateFormats = new Map<string, Intl.DateTimeFormat>();
export function calendarWeekLabels(locale: string) {
  let format = weekdayFormats.get(locale);
  if (!format) { format = new Intl.DateTimeFormat(locale, { weekday: "short", calendar: "gregory", timeZone: "UTC" }); weekdayFormats.set(locale, format); }
  return Array.from({ length: 7 }, (_, i) => format.format(new Date(Date.UTC(2026, 10, 1 + i, 12))));
}
export function calendarDateLabel(month: string, day: number, locale: string) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month) || !Number.isInteger(day) || day < 1 || day > 31) return "";
  const date = new Date(`${month}-${String(day).padStart(2, "0")}T12:00:00Z`);
  if (date.toISOString().slice(0, 7) !== month) return "";
  let format = fullDateFormats.get(locale);
  if (!format) { format = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", calendar: "gregory", timeZone: "UTC" }); fullDateFormats.set(locale, format); }
  return format.format(date);
}
