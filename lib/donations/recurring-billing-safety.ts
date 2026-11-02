import type { PrismaClient } from "@prisma/client";
import { firstChargeForPlan, isRecurringFrequency, nextChargeAfterPayment, nextChargeForPlan, normalizeTimezone, parseScheduleRule, planRule, wallClock } from "./recurring-schedule";

export type BillingSafetyPlan = {
  id: string; provider: string | null; status: string; frequency: string | null;
  timezone: string | null; scheduleRule: unknown; amount: number;
  nextBillingDate: Date | null; lastBillingDate: Date | null; chargeAttempts: number;
};
type Proof = { paidAt: Date; initial: boolean };
export type BillingSafetyDecision =
  | { state: "ready" }
  | { state: "postpone"; date: Date; reason: "PERIOD_ALREADY_PAID" | "FRIDAY_ONLY"; resetAttempts: boolean }
  | { state: "hold"; reason: string };

export const ORDINARY_PAYMENT_WHERE = {
  OR: [{ billingReason: { not: "subscription_test_cycle" } }, { billingReason: null }, { billingReason: { isSet: false as const } }],
};

/** Pure policy shared by charging and the deployment audit. */
export function recurringBillingDecision(plan: BillingSafetyPlan, proof: Proof, now: Date): BillingSafetyDecision {
  if (!plan.nextBillingDate || !Number.isFinite(plan.nextBillingDate.getTime()) || !Number.isFinite(proof.paidAt.getTime()) || proof.paidAt.getTime() > now.getTime() + 300_000) return { state: "hold", reason: "RECURRING_DATE_REVIEW_REQUIRED" };
  if (plan.frequency !== null && !isRecurringFrequency(plan.frequency)) return { state: "hold", reason: "RECURRING_FREQUENCY_REVIEW_REQUIRED" };
  if (plan.timezone && !normalizeTimezone(plan.timezone, "")) return { state: "hold", reason: "RECURRING_TIMEZONE_REVIEW_REQUIRED" };
  if (plan.scheduleRule != null) {
    const rule = parseScheduleRule(plan.scheduleRule), raw = plan.scheduleRule as Record<string, unknown>;
    if (!rule || !planRule(plan) || (raw.hour !== undefined && raw.hour !== rule.hour) || (raw.minute !== undefined && raw.minute !== rule.minute)) return { state: "hold", reason: "RECURRING_RULE_REVIEW_REQUIRED" };
  }
  const earliest = proof.initial ? firstChargeForPlan(plan, proof.paidAt) : nextChargeAfterPayment(plan, proof.paidAt);
  let date = plan.nextBillingDate < earliest ? earliest : plan.nextBillingDate;
  const resetAttempts = date > plan.nextBillingDate;
  let reason: "PERIOD_ALREADY_PAID" | "FRIDAY_ONLY" = "PERIOD_ALREADY_PAID";
  const evaluatedAt = date > now ? date : now;
  if (plan.frequency === "FRIDAY" && wallClock(evaluatedAt, normalizeTimezone(plan.timezone)).weekday !== 5) {
    date = nextChargeForPlan(plan, evaluatedAt); reason = "FRIDAY_ONLY";
  }
  return date > plan.nextBillingDate ? { state: "postpone", date, reason, resetAttempts } : { state: "ready" };
}

type SafetyDatabase = Pick<PrismaClient, "donation" | "subscription">;

/** Read the actual ordinary ledger under the caller's lease, before a new
 * attempt. A stale plan pointer is never evidence of successful payment. */
export async function inspectRecurringBillingSafety(db: SafetyDatabase, plan: BillingSafetyPlan, now: Date): Promise<BillingSafetyDecision> {
  const [payments, unresolved] = await Promise.all([
    db.donation.findMany({ where: { subscriptionId: plan.id, status: "PAID", paidAt: { not: null }, ...ORDINARY_PAYMENT_WHERE }, orderBy: [{ paidAt: "desc" }, { id: "desc" }], take: 2,
      select: { id: true, paidAt: true, billingReason: true, providerTxnType: true } }),
    db.donation.findFirst({ where: { subscriptionId: plan.id, AND: [ORDINARY_PAYMENT_WHERE,
      { OR: [{ paidAt: null }, { paidAt: { isSet: false } }] },
      { OR: [{ providerTxnResult: { in: ["Pending", "Unknown"] } }, { status: "PAID" }] },
    ] }, select: { id: true } }),
  ]);
  if (unresolved) return { state: "hold", reason: "RECURRING_OUTCOME_REVIEW_REQUIRED" };
  const latest = payments[0];
  if (!latest?.paidAt) return { state: "hold", reason: "RECURRING_FIRST_PAYMENT_UNCONFIRMED" };
  const renewal = latest.billingReason === "subscription_cycle" || ["RecurringSale", "RecurringCapture"].includes(latest.providerTxnType ?? "");
  return recurringBillingDecision(plan, { paidAt: latest.paidAt, initial: payments.length === 1 && !renewal }, now);
}

/** Postponement only; concurrent cancellation or date changes win. */
export async function applyRecurringBillingSafety(db: SafetyDatabase, plan: BillingSafetyPlan, decision: BillingSafetyDecision): Promise<boolean> {
  if (decision.state === "ready") return false;
  const result = await db.subscription.updateMany({ where: { id: plan.id, provider: plan.provider, status: "ACTIVE", amount: plan.amount,
    nextBillingDate: plan.nextBillingDate, lastBillingDate: plan.lastBillingDate, chargeAttempts: plan.chargeAttempts },
    data: decision.state === "hold" ? { status: "PAUSED", lastChargeError: decision.reason } : {
      nextBillingDate: decision.date, ...(decision.resetAttempts ? { chargeAttempts: 0, lastChargeError: null } : {}),
    },
  });
  return result.count === 1;
}

export function fridayBillingWindowClosed(plan: BillingSafetyPlan, now: Date): boolean {
  return plan.frequency === "FRIDAY" && wallClock(now, normalizeTimezone(plan.timezone)).weekday !== 5;
}

/** Recheck immediately before submission: conversions/DB writes may have
 * crossed midnight after the initial guard. This attempt has not been sent. */
export async function deferClosedFridayWindow(db: SafetyDatabase, plan: BillingSafetyPlan, donationId: string, now: Date): Promise<boolean> {
  if (!fridayBillingWindowClosed(plan, now)) return false;
  await db.donation.updateMany({where:{id:donationId,paidAt:null,providerTxnResult:"Pending"},data:{status:"FAILED",providerTxnResult:"Failed",providerErrorMessage:"NOT_SENT: Friday billing window closed before submission"}});
  await applyRecurringBillingSafety(db, plan, {state:"postpone",date:nextChargeForPlan(plan,now),reason:"FRIDAY_ONLY",resetAttempts:false});
  return true;
}
