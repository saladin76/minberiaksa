/**
 * Dashboard table shows the date used by its accounting-date filter.
 * Settled PAID donations belong to paidAt; FAILED or pending attempts
 * belong to createdAt. Never infer a settlement date from status alone.
 */
export function dashboardDonationDisplayDate(row: {
  status: string;
  paidAt?: string | Date | null;
  createdAt: string | Date;
}): Date {
  if (row.status === "PAID" && row.paidAt) {
    const settled = new Date(row.paidAt);
    if (Number.isFinite(settled.getTime())) return settled;
  }
  return new Date(row.createdAt);
}

/** Sorting within a pure PAID accounting list uses settlement chronology.
 * Mixed-status lists retain legacy creation-date sort until an audited
 * cross-status chronological order is implemented.
 */
export function dashboardDonationDateSortField(
  dateBasis: string | null,
  status: string | null,
  sortBy: string,
): "paidAt" | "createdAt" | "amountUSD" {
  if (sortBy === "amount") return "amountUSD";
  return dateBasis === "accounting" && status === "PAID" ? "paidAt" : "createdAt";
}
