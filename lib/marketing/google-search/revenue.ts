import { prisma } from "@/lib/prisma";
import { fromWallClock } from "@/lib/donations/recurring-schedule";
export function searchReportWindow(period: { startDate: string; endDate: string }, timezone: string) {
  const midnight = (value: string, addDay = 0) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("INVALID_REPORT_DATE");
    const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + addDay);
    return fromWallClock({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: 0, minute: 0, second: 0 }, timezone);
  };
  return { since: midnight(period.startDate), until: midnight(period.endDate, 1) };
}
/** Paid ledger only. No contacts or identifiers leave this aggregation. */
export async function searchPlanRevenue(planId: string, window: { since: Date; until: Date }) {
  const { since, until } = window;
  let cursor: string | undefined, cents = 0, paid = 0, missingFx = 0, scanned = 0;
  while (true) {
    const rows = await prisma.donation.findMany({ where: { status: "PAID", paidAt: { gte: since, lt: until }, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: "asc" }, take: 1000, select: { id: true, amount: true, amountUSD: true, currency: true, attribution: true } });
    for (const row of rows) {
      const attribution = row.attribution as Record<string, unknown> | null;
      if (attribution?.utm_campaign !== `gs-${planId}`) continue;
      paid++;
      const usd = row.amountUSD ?? (row.currency === "USD" ? row.amount : null);
      if (usd == null || !Number.isFinite(usd)) missingFx++; else cents += Math.round(usd * 100);
    }
    scanned += rows.length;
    if (rows.length < 1000) return { paid, revenueUSD: cents / 100, missingFx, complete: true, since: since.toISOString(), until: until.toISOString() };
    if (scanned >= 100000) return { paid, revenueUSD: cents / 100, missingFx, complete: false, since: since.toISOString(), until: until.toISOString() };
    cursor = rows.at(-1)!.id;
  }
}
