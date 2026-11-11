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

/**
 * Opt-in financial calendar is available only to a revenue-authorized
 * dashboard reader with a complete date window. It must never affect legacy
 * donor listing requests or the subscription-only staff view.
 */
export function canUseAccountingDate(input: {
  revenueAuthorized: boolean;
  dateBasis: string | null;
  start: string | null;
  end: string | null;
}): boolean {
  return input.revenueAuthorized &&
    input.dateBasis === "accounting" &&
    Boolean(input.start && input.end);
}
