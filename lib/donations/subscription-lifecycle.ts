import type { Prisma } from "@prisma/client";

/** Dashboard lifecycle is separate from the scheduler's retry/lease state. */
export type SubscriptionLifecycle = "ACTIVE" | "AWAITING_FIRST_PAYMENT" | "PAUSED" | "CANCELLED" | "PAYMENT_FAILED";
export const SUBSCRIPTION_LIFECYCLE_LABELS: Record<SubscriptionLifecycle, string> = {
  ACTIVE: "نشط", AWAITING_FIRST_PAYMENT: "لم يتفعّل — لا توجد دفعة مؤكدة",
  PAUSED: "موقوف مؤقتًا", CANCELLED: "ملغي", PAYMENT_FAILED: "معلق — تعثر التجديد",
};

// Synthetic test cycles do not activate an agreement. Legacy rows may omit billingReason.
export const ACTIVATING_DONATION_WHERE: Prisma.DonationWhereInput = {
  status: "PAID", paidAt: { not: null },
  OR: [{ billingReason: null }, { billingReason: { isSet: false } }, { billingReason: { not: "subscription_test_cycle" } }],
};
const funded: Prisma.SubscriptionWhereInput = { donations: { some: ACTIVATING_DONATION_WHERE } };
const failedRenewal: Prisma.SubscriptionWhereInput = { OR: [
  { chargeAttempts: { gt: 0 } },
  { lastChargeError: { not: null }, NOT: { lastChargeError: "" } },
] };

export function subscriptionLifecycleWhere(status: string): Prisma.SubscriptionWhereInput {
  if (status === "AWAITING_FIRST_PAYMENT") return { donations: { none: ACTIVATING_DONATION_WHERE } };
  if (status === "ACTIVE") return { AND: [funded, { status: "ACTIVE" },
    { NOT: { chargeAttempts: { gt: 0 } } },
    { OR: [{ lastChargeError: null }, { lastChargeError: { isSet: false } }, { lastChargeError: "" }] },
  ] };
  if (status === "PAYMENT_FAILED") return { AND: [funded, { OR: [{ status: "PAYMENT_FAILED" }, { status: "ACTIVE", AND: [failedRenewal] }] }] };
  if (status === "PAUSED" || status === "CANCELLED") return { AND: [funded, { status }] };
  return funded;
}

export function subscriptionLifecycle(plan: { status: string; hasPaidDonation: boolean; chargeAttempts?: number | null; lastChargeError?: string | null }): SubscriptionLifecycle {
  if (plan.status === "CANCELLED") return "CANCELLED";
  if (!plan.hasPaidDonation) return "AWAITING_FIRST_PAYMENT";
  if (plan.status === "PAUSED") return "PAUSED";
  if (plan.status === "PAYMENT_FAILED" || (plan.chargeAttempts ?? 0) > 0 || plan.lastChargeError?.trim()) return "PAYMENT_FAILED";
  return "ACTIVE";
}
