export type ProfileDonationEvidence = {
  paymentStatus?: string | null;
  status?: string | null;
  paidAt?: string | Date | null;
  createdAt?: string | Date | null;
  subscriptionId?: string | null;
  billingReason?: string | null;
};

function validDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** A plan's ACTIVE status never proves that a payment attempt was collected. */
export function isSettledProfileDonation(donation: ProfileDonationEvidence): boolean {
  return (donation.paymentStatus ?? donation.status) === "PAID" && validDate(donation.paidAt) !== null;
}

/** Successful gifts belong to the date they were collected. Failed/pending
 * attempts keep their creation date so they remain visible in the history. */
export function profileDonationDate(donation: ProfileDonationEvidence): Date | null {
  return isSettledProfileDonation(donation) ? validDate(donation.paidAt) : validDate(donation.createdAt);
}

function monthKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(date);
  return `${parts.find(part => part.type === "year")!.value}-${parts.find(part => part.type === "month")!.value}`;
}

export function profileDonationMatchesPeriod(
  donation: ProfileDonationEvidence,
  period: string,
  now: Date,
  timeZone: string,
): boolean {
  if (period !== "month" && period !== "year") return true;
  const date = profileDonationDate(donation);
  if (!date) return false;
  const value = monthKey(date, timeZone), current = monthKey(now, timeZone);
  return period === "month" ? value === current : value.slice(0, 4) === current.slice(0, 4);
}

/** Calendar months of proven recurring giving, not attempts, elapsed duration,
 * or active plans. All cadences share a month; accelerated QA cycles do not
 * create ordinary donation months. The caller supplies the selected period. */
export function successfulRecurringMonthCount(donations: readonly ProfileDonationEvidence[], timeZone: string): number {
  const months = new Set<string>();
  for (const donation of donations) {
    if (!donation.subscriptionId || donation.billingReason === "subscription_test_cycle" || !isSettledProfileDonation(donation)) continue;
    months.add(monthKey(validDate(donation.paidAt)!, timeZone));
  }
  return months.size;
}
