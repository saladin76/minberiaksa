import type { Prisma } from "@prisma/client";

/**
 * MongoDB stores an optional field that was never written as **absent**, not as null.
 * Prisma's `{ field: null }` only matches an explicit null, so it silently misses every
 * row where the field was simply never set — and on this database that is the majority:
 *
 *   Donation.subscriptionId  →  46 explicit null, 1172 absent
 *   Donation.paidAt          →   6 explicit null,  425 absent
 *   Donation.conversionFailedEventsSentAt → 0 explicit null, 1302 absent
 *
 * The failure mode is silent and expensive: `{ subscriptionId: null }` matched 41 of the
 * 1022 one-time paid donations on the revenue cards, and `{ paidAt: null }` failing to
 * find an unsettled row is what made the Stripe webhook create a duplicate donation for
 * an invoice it had already recorded.
 *
 * `{ field: { not: null } }` is NOT affected — it correctly excludes both absent and null.
 * Only the "is empty" direction needs this helper.
 *
 * IMPORTANT: the returned predicate contains a top-level `OR`. Always compose it under
 * `AND` (or `donationWhereAll` below) — spreading it into another object that also carries
 * an `OR` silently drops one of them, which is a separate live bug on the revenue cards.
 */
type NullableDonationField =
  | "paidAt"
  | "subscriptionId"
  | "referralId"
  | "locale"
  | "providerOrderId"
  | "conversionEventsSentAt"
  | "conversionFailedEventsSentAt";

/** Matches rows where the field is explicitly null OR absent from the document. */
export function donationFieldEmpty(field: NullableDonationField): Prisma.DonationWhereInput {
  return { OR: [{ [field]: null }, { [field]: { isSet: false } }] } as Prisma.DonationWhereInput;
}

/**
 * Safely combine several donation filters that may each carry their own top-level `OR`.
 * Use this instead of object spread whenever one of the inputs might be an `OR` predicate.
 */
export function donationWhereAll(
  ...filters: (Prisma.DonationWhereInput | null | undefined)[]
): Prisma.DonationWhereInput {
  const present = filters.filter(Boolean) as Prisma.DonationWhereInput[];
  if (present.length === 0) return {};
  if (present.length === 1) return present[0];
  return { AND: present };
}
