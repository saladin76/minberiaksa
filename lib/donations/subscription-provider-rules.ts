/**
 * Pure rules for recurring plans and their payment provider — no Stripe SDK,
 * so they can be unit-tested. The Stripe calls live in
 * subscription-provider-control.ts, which re-exports these.
 */

export type PlanStatus = "ACTIVE" | "PAUSED" | "CANCELLED";
export type PlanRail = "STRIPE" | "ALBARAKA" | "NONE";

export interface PlanProviderFields {
  id: string;
  provider?: string | null;
  stripeSubscriptionId?: string | null;
  payforToken?: string | null;
}

/** Which rail bills this plan. Rows from before `provider` existed are Stripe. */
export function planRail(plan: PlanProviderFields): PlanRail {
  if (plan.provider === "ALBARAKA") return "ALBARAKA";
  const stripeId = plan.stripeSubscriptionId ?? plan.payforToken ?? null;
  return stripeId ? "STRIPE" : "NONE";
}

/** Map Stripe's view of a plan onto the local status it should have; null when not decidable. */
export function expectedLocalStatusFor(providerStatus: string, paused: boolean): PlanStatus | null {
  if (providerStatus === "canceled" || providerStatus === "incomplete_expired") return "CANCELLED";
  if (paused) return "PAUSED";
  if (providerStatus === "active" || providerStatus === "trialing" || providerStatus === "past_due") return "ACTIVE";
  return null;
}
