import { istanbulAddCalendarDaysKey, istanbulTodayKey } from "./istanbul-client-date";

export type DashboardPeriod =
  | "day"
  | "yesterday"
  | "week"
  | "month"
  | "year"
  | "all"
  | "custom";

export interface PeriodDateKeys {
  start: string | null;
  end: string | null;
}

/**
 * Calendar-aware Istanbul date keys for the dashboard period filter.
 *
 *   - day        → today 00:00 → today 23:59 (single calendar day)
 *   - yesterday  → yesterday 00:00 → yesterday 23:59
 *   - week       → last 7 calendar days (today and the 6 before it)
 *   - month      → 1st of the current month 00:00 → today
 *   - year       → Jan 1 of the current year 00:00 → today
 *   - all        → no filter
 *   - custom     → caller-supplied range
 *
 * Keys are YYYY-MM-DD in the Istanbul calendar, matching what the dashboard
 * API endpoints expect (they interpret both start and end as inclusive
 * Istanbul-day boundaries).
 */
export function getPeriodDateKeys(
  period: DashboardPeriod,
  dateFrom: string,
  dateTo: string,
  now: Date = new Date()
): PeriodDateKeys {
  if (period === "all") return { start: null, end: null };
  if (period === "custom") {
    return { start: dateFrom || null, end: dateTo || null };
  }

  const today = istanbulTodayKey(now);

  switch (period) {
    case "day":
      return { start: today, end: today };
    case "yesterday": {
      const yesterday = istanbulAddCalendarDaysKey(today, -1);
      return { start: yesterday, end: yesterday };
    }
    case "week":
      return { start: istanbulAddCalendarDaysKey(today, -6), end: today };
    case "month": {
      const [y, m] = today.split("-");
      return { start: `${y}-${m}-01`, end: today };
    }
    case "year": {
      const [y] = today.split("-");
      return { start: `${y}-01-01`, end: today };
    }
    default:
      return { start: null, end: null };
  }
}
