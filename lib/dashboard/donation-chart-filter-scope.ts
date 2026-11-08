/**
 * Filter contract shared by the chart endpoint and the filtered-period KPI band.
 *
 * Financial totals are strictly settled donations (PAID with paidAt). FAILED
 * and PENDING are attempt counts, never revenue. Dates use the inclusive UTC
 * range of the selected Istanbul calendar days.
 */
export type DonationChartStatus = "RESOLVED" | "PAID" | "FAILED" | "PENDING" | "all";
export type DonationChartType = "all" | "ONE_TIME" | "MONTHLY";

export function donationChartStatusWhere(
  status: string | null,
  startDate: Date,
  endDate: Date,
) {
  const paid = { status: "PAID", paidAt: { gte: startDate, lte: endDate } };
  const failed = { status: "FAILED", createdAt: { gte: startDate, lte: endDate } };
  const pending = {
    status: "PAID",
    createdAt: { gte: startDate, lte: endDate },
    OR: [{ paidAt: null }, { paidAt: { isSet: false } }],
  };
  switch (status) {
    case "PAID": return paid;
    case "FAILED": return failed;
    case "PENDING": return pending;
    case "all": return { OR: [paid, failed, pending] };
    default: return { OR: [paid, failed] };
  }
}

/** MongoDB optional fields can be explicitly null OR absent. */
export function donationChartTypeWhere(type: string | null) {
  if (type === "ONE_TIME") {
    return { OR: [{ subscriptionId: null }, { subscriptionId: { isSet: false } }] };
  }
  if (type === "MONTHLY") return { subscriptionId: { not: null } };
  return null;
}

export type ScopedDonationChartRow = {
  amountUSD?: number;
  count?: number;
  amountOneTime?: number;
  countOneTime?: number;
  amountMonthly?: number;
  countMonthly?: number;
  amountFailed?: number;
  countFailed?: number;
  countPending?: number;
  teamSupport?: number;
  fees?: number;
};

export function summarizeScopedDonationChart(rows: readonly ScopedDonationChartRow[]) {
  const number = (value?: number) => typeof value === "number" && Number.isFinite(value) ? value : 0;
  return rows.reduce((sum, row) => ({
    paidAmountUSD: sum.paidAmountUSD + number(row.amountUSD),
    paidCount: sum.paidCount + number(row.count),
    oneTimeAmountUSD: sum.oneTimeAmountUSD + number(row.amountOneTime),
    oneTimeCount: sum.oneTimeCount + number(row.countOneTime),
    recurringAmountUSD: sum.recurringAmountUSD + number(row.amountMonthly),
    recurringCount: sum.recurringCount + number(row.countMonthly),
    failedCount: sum.failedCount + number(row.countFailed),
    pendingCount: sum.pendingCount + number(row.countPending),
    attemptedFailedAmountUSD: sum.attemptedFailedAmountUSD + number(row.amountFailed),
    teamSupportUSD: sum.teamSupportUSD + number(row.teamSupport),
    feesUSD: sum.feesUSD + number(row.fees),
  }), {
    paidAmountUSD: 0, paidCount: 0,
    oneTimeAmountUSD: 0, oneTimeCount: 0,
    recurringAmountUSD: 0, recurringCount: 0,
    failedCount: 0, pendingCount: 0,
    attemptedFailedAmountUSD: 0, teamSupportUSD: 0, feesUSD: 0,
  });
}
