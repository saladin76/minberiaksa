import { donationChartStatusWhere } from "./donation-chart-filter-scope";

/**
 * Opt-in filter for financial dashboard rows. A completed charge belongs to
 * the Istanbul day it settled (paidAt); failed or still-pending attempts belong
 * to the day they were created. This is the chart's existing contract.
 *
 * Legacy /api/donations callers intentionally keep createdAt date filtering.
 * This helper only constructs a Prisma-compatible WHERE fragment; it never
 * writes, settles or changes payment records.
 */
export function accountingDateWhere(
  status: string | null,
  startDate: Date,
  endDate: Date,
) {
  return donationChartStatusWhere(status, startDate, endDate);
}
