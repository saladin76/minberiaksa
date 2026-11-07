export type ReductionBlockReason = "PLAN_INACTIVE" | "RECONCILIATION_REQUIRED" | "BILLING_IN_PROGRESS" | "RETRY_PENDING" | "SCHEDULE_MISSING" | "BILLING_DUE_SOON";

export type ReductionEligibility = {
  allowed: boolean;
  reason: ReductionBlockReason | null;
  nextBillingDate: string | null;
  chargeAttempts: number;
  checkedAt: string;
};

type ReductionPlan = {
  status: string;
  nextBillingDate: Date | null;
  chargeAttempts?: number | null;
  billingLeaseUntil?: Date | null;
  amountChangeLock?: string | null;
};

/** Read-only projection of the existing repricing gates. No scheduling or retry changes. */
export function subscriptionReductionEligibility(plan: ReductionPlan, now = new Date()): ReductionEligibility {
  const due = plan.nextBillingDate?.getTime();
  let reason: ReductionBlockReason | null = null;
  if (plan.status !== "ACTIVE" && plan.status !== "PAUSED") reason = "PLAN_INACTIVE";
  else if (plan.amountChangeLock) reason = "RECONCILIATION_REQUIRED";
  else if (plan.billingLeaseUntil && plan.billingLeaseUntil > now) reason = "BILLING_IN_PROGRESS";
  else if (plan.chargeAttempts) reason = "RETRY_PENDING";
  else if (due == null || !Number.isFinite(due)) reason = "SCHEDULE_MISSING";
  else if (due - now.getTime() < 24 * 3600_000) reason = "BILLING_DUE_SOON";
  return {
    allowed: reason === null, reason,
    nextBillingDate: due != null && Number.isFinite(due) ? plan.nextBillingDate!.toISOString() : null,
    chargeAttempts: plan.chargeAttempts ?? 0,
    checkedAt: now.toISOString(),
  };
}
