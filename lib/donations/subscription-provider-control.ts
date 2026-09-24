import Stripe from "stripe";

/**
 * Applies a recurring plan's status change at the payment provider, BEFORE the
 * database is touched.
 *
 * Why: the dashboard and the donor profile used to write `Subscription.status`
 * only. A plan marked CANCELLED or PAUSED locally kept being charged by Stripe,
 * because nothing told Stripe. The Stripe → DB direction (webhook) existed; the
 * DB → Stripe direction did not.
 *
 * Contract:
 *   - The caller calls this first. If it throws, the caller must NOT update the
 *     database and must report the failure to the user.
 *   - On success the caller writes the local status; the Stripe webhook later
 *     reconciles to the same state.
 *
 * Rails:
 *   - STRIPE:   cancel  → subscriptions.cancel (immediate, no further invoices)
 *               pause   → pause_collection { behavior: "void" } (invoices voided)
 *               resume  → pause_collection cleared
 *   - ALBARAKA: the site's own scheduler charges only `status: ACTIVE` plans, so
 *               the local status IS the provider state. Nothing to call.
 *   - NONE:     no provider id was ever recorded (checkout never completed).
 *               Nothing is billing it; the local status is all there is.
 */

import {
  expectedLocalStatusFor,
  planRail,
  type PlanProviderFields,
  type PlanStatus,
} from "./subscription-provider-rules";

export { expectedLocalStatusFor, planRail };
export type { PlanProviderFields, PlanStatus };

export interface ProviderResult {
  rail: "STRIPE" | "ALBARAKA" | "NONE";
  stripeSubscriptionId?: string;
  /** Stripe's own status after the call, e.g. "active", "canceled". */
  providerStatus?: string;
  /** Whether Stripe collection is paused after the call. */
  providerPaused?: boolean;
}

export class ProviderSyncError extends Error {
  constructor(
    public code:
      | "STRIPE_NOT_CONFIGURED"
      | "STRIPE_ALREADY_CANCELLED"
      | "STRIPE_CALL_FAILED",
    message: string,
    public httpStatus: number
  ) {
    super(message);
    this.name = "ProviderSyncError";
  }
}

let stripeClient: Stripe | null = null;
function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new ProviderSyncError(
      "STRIPE_NOT_CONFIGURED",
      "Stripe is not configured on the server, so the plan cannot be changed at the provider.",
      503
    );
  }
  if (!stripeClient) {
    stripeClient = new Stripe(key, { apiVersion: "2026-03-25.dahlia" });
  }
  return stripeClient;
}

export interface ProviderStateCheck {
  rail: ProviderResult["rail"];
  localStatus: string;
  /** Stripe's status, or null when the rail has no external provider. */
  providerStatus: string | null;
  providerPaused: boolean | null;
  /** The local status the provider state corresponds to, or null when unknowable. */
  expectedLocalStatus: PlanStatus | null;
  inSync: boolean;
  error?: string;
}


/**
 * Read-only comparison of the local status with the provider's. Used by the
 * monthly dashboard to show a SYNC ERROR instead of silently trusting either.
 */
export async function checkPlanProviderState(plan: PlanProviderFields & { status: string }): Promise<ProviderStateCheck> {
  const rail = planRail(plan);
  if (rail !== "STRIPE") {
    return { rail, localStatus: plan.status, providerStatus: null, providerPaused: null, expectedLocalStatus: null, inSync: true };
  }
  try {
    const sub = await stripe().subscriptions.retrieve((plan.stripeSubscriptionId ?? plan.payforToken)!);
    const paused = Boolean(sub.pause_collection);
    const expected = expectedLocalStatusFor(sub.status, paused);
    return {
      rail,
      localStatus: plan.status,
      providerStatus: sub.status,
      providerPaused: paused,
      expectedLocalStatus: expected,
      inSync: expected === null ? true : expected === plan.status,
    };
  } catch (err) {
    return {
      rail,
      localStatus: plan.status,
      providerStatus: null,
      providerPaused: null,
      expectedLocalStatus: null,
      inSync: false,
      error: err instanceof ProviderSyncError ? err.message : `Could not read the plan from Stripe: ${(err as Error).message}`,
    };
  }
}

export async function applyPlanStatusAtProvider(
  plan: PlanProviderFields,
  next: PlanStatus
): Promise<ProviderResult> {
  const rail = planRail(plan);
  if (rail !== "STRIPE") return { rail };

  const stripeId = (plan.stripeSubscriptionId ?? plan.payforToken)!;
  const client = stripe();

  let current: Stripe.Subscription;
  try {
    current = await client.subscriptions.retrieve(stripeId);
  } catch (err) {
    throw new ProviderSyncError(
      "STRIPE_CALL_FAILED",
      `Could not read the plan from Stripe: ${(err as Error).message}`,
      502
    );
  }

  if (current.status === "canceled" || current.status === "incomplete_expired") {
    if (next === "CANCELLED") {
      return { rail, stripeSubscriptionId: stripeId, providerStatus: current.status, providerPaused: false };
    }
    throw new ProviderSyncError(
      "STRIPE_ALREADY_CANCELLED",
      "This plan is already cancelled in Stripe and cannot be reactivated. The donor must start a new plan.",
      409
    );
  }

  try {
    let updated: Stripe.Subscription;
    if (next === "CANCELLED") {
      updated = await client.subscriptions.cancel(stripeId);
    } else if (next === "PAUSED") {
      updated = await client.subscriptions.update(stripeId, {
        pause_collection: { behavior: "void" },
      });
    } else {
      updated = await client.subscriptions.update(stripeId, {
        pause_collection: "",
      });
    }
    return {
      rail,
      stripeSubscriptionId: stripeId,
      providerStatus: updated.status,
      providerPaused: Boolean(updated.pause_collection),
    };
  } catch (err) {
    throw new ProviderSyncError(
      "STRIPE_CALL_FAILED",
      `Stripe refused the change: ${(err as Error).message}`,
      502
    );
  }
}
