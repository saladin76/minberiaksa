export type SummaryDonation = {
  status: string; paidAt: Date | null; createdAt: Date; amountUSD: number | null;
  totalAmount: number; teamSupport: number | null; currency: string;
};
type Metric = { amountUSD: number; count: number; unpriced: number };
export function emptyHomeDonationSummary() {
  return { today: { amountUSD: 0, count: 0, unpriced: 0 } as Metric, month: { amountUSD: 0, count: 0, unpriced: 0 } as Metric, support: { amountUSD: 0, count: 0, unpriced: 0 } as Metric, failed: { amountUSD: 0, count: 0, unpriced: 0 } as Metric };
}
export function addHomeSummaryDonation(summary: ReturnType<typeof emptyHomeDonationSummary>, row: SummaryDonation, range: { todayStart: Date; monthStart: Date; now: Date }) {
  const usd = typeof row.amountUSD === "number" && Number.isFinite(row.amountUSD) && row.amountUSD > 0 ? row.amountUSD
    : row.currency === "USD" && Number.isFinite(row.totalAmount) && row.totalAmount >= 0 ? row.totalAmount : null;
  const add = (metric: Metric, value = usd) => { metric.count++; if (value === null) metric.unpriced++; else metric.amountUSD += value; };
  if (row.status === "PAID" && row.paidAt && row.paidAt >= range.monthStart && row.paidAt <= range.now) {
    add(summary.month);
    if (row.paidAt >= range.todayStart) add(summary.today);
    if ((row.teamSupport ?? 0) > 0) {
      const supportUsd = usd !== null && row.totalAmount > 0 ? usd * row.teamSupport! / row.totalAmount : null;
      add(summary.support, supportUsd);
    }
  }
  if (row.status === "FAILED" && !row.paidAt && row.createdAt >= range.monthStart && row.createdAt <= range.now) add(summary.failed);
}
