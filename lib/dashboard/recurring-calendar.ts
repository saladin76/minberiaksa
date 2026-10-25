import { formatIstanbulDateKey, istanbulDateKeysToUtcRange } from "../admin/istanbul-calendar";
import { nextChargeForPlan, planRule } from "../donations/recurring-schedule";

/** Reporting only: never executes, advances or repairs a subscription. */
export function recurringCalendarMonth(value?: string | null, now = new Date()) {
  const month = value ?? formatIstanbulDateKey(now).slice(0, 7);
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, number] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const range = istanbulDateKeysToUtcRange(`${month}-01`, `${month}-${days}`);
  return { month, days, ...range };
}
export type CalendarMonth = NonNullable<ReturnType<typeof recurringCalendarMonth>>;
export function calendarDay(at: Date | string | null | undefined, month: CalendarMonth): number | null {
  if (!at) return null;
  const date = new Date(at);
  if (!Number.isFinite(date.getTime()) || date < month.startDate || date > month.endDate) return null;
  return Number(formatIstanbulDateKey(date).slice(8, 10));
}
export function calendarAmountUSD(row: { amountUSD?: number | null; amount: number; currency: string; totalAmount?: number | null }): number | null {
  const value = row.amountUSD ?? (row.currency === "USD" ? row.totalAmount ?? row.amount : null);
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}
export type CalendarPlan = {
  frequency: string;
  nextBillingDate: Date | string | null;
  timezone?: string | null;
  scheduleRule?: unknown;
};
/** Uses the collector's recurrence engine, starting with its authoritative next due date.
 * Missing dates are not invented from creation/last-payment dates. No past first gifts
 * are projected as renewals. A paused/failed/unpaid plan must be excluded by the caller.
 */
export function calendarOccurrences(plan: CalendarPlan, month: CalendarMonth): Date[] | null {
  if (!plan.nextBillingDate) return null;
  let date = new Date(plan.nextBillingDate);
  if (!Number.isFinite(date.getTime())) return null;
  const occurrences: Date[] = [];
  // Stored rules can jump directly; legacy plans must walk the exact engine, including
  // its month-end clamping, rather than invent a different schedule for the report.
  if (date < month.startDate && planRule(plan)?.hour !== undefined) {
    date = nextChargeForPlan(plan, new Date(month.startDate.getTime() - 1));
  }
  for (let steps = 0; date <= month.endDate; steps++) {
    if (steps >= 10000) return null;
    if (date >= month.startDate) occurrences.push(date);
    const next = nextChargeForPlan(plan, date);
    if (!Number.isFinite(next.getTime()) || next <= date) return null;
    date = next;
  }
  return occurrences;
}
export function emptyCalendar(month: CalendarMonth) {
  return Array.from({ length: month.days }, (_, i) => ({ day: i + 1, amountUSD: 0, count: 0 }));
}
