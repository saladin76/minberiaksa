/**
 * Which gateway a given donation should be charged through.
 *
 * Three rails exist:
 *   - PAYFOR   — Ziraat Katılım 3D Secure. Unchanged, opt-out only: it keeps
 *                exactly the case it always had (one-time TRY donations) as long
 *                as the admin leaves its switch on.
 *   - STRIPE   — the original main gateway.
 *   - ALBARAKA — Albaraka Türk EPOS 3D Secure, an alternative main gateway.
 *
 * STRIPE and ALBARAKA are interchangeable: whichever the admin picks as the main
 * gateway handles every case the other would have handled, with one exception —
 * monthly subscriptions, which need stored-credential recurring billing that the
 * Albaraka EPOS integration doesn't offer. Those stay on Stripe regardless.
 */

/** Gateway an admin can nominate as the main one in the dashboard. */
export type MainGateway = "STRIPE" | "ALBARAKA";

/** Gateway actually used to charge a specific donation. */
export type ResolvedGateway = "STRIPE" | "ALBARAKA" | "PAYFOR";

export const MAIN_GATEWAYS: readonly MainGateway[] = ["STRIPE", "ALBARAKA"] as const;

export function isMainGateway(value: unknown): value is MainGateway {
  return value === "STRIPE" || value === "ALBARAKA";
}

/** Normalises anything stored/received into a valid main gateway, defaulting to Stripe. */
export function parseMainGateway(value: unknown): MainGateway {
  return isMainGateway(value) ? value : "STRIPE";
}

export type GatewayResolutionInput = {
  mainGateway: MainGateway;
  payforEnabled: boolean;
  /** ISO currency the donor is giving in, e.g. "TRY". */
  currency: string;
  /** Monthly donations create a subscription and can only run on Stripe. */
  donationType?: "ONE_TIME" | "MONTHLY" | null;
  /**
   * Set once a gateway has already failed and the donor was handed a Stripe
   * PaymentIntent to retry with — that forces Stripe for the rest of the attempt.
   */
  forceStripe?: boolean;
};

export function resolveGateway({
  mainGateway,
  payforEnabled,
  currency,
  donationType = "ONE_TIME",
  forceStripe = false,
}: GatewayResolutionInput): ResolvedGateway {
  if (forceStripe) return "STRIPE";
  // Subscriptions are Stripe-only: neither PayFor nor Albaraka gives us a
  // reusable credential to bill on the next cycle.
  if (donationType === "MONTHLY") return "STRIPE";
  // PayFor's case is unchanged from before Albaraka existed: an explicitly
  // one-time TRY donation, with the admin switch on.
  if (
    payforEnabled &&
    donationType === "ONE_TIME" &&
    String(currency || "").toUpperCase() === "TRY"
  ) {
    return "PAYFOR";
  }
  return mainGateway;
}

/** Lower-case name used by the analytics/pixel layer. */
export function gatewayAnalyticsName(
  gateway: ResolvedGateway
): "stripe" | "albaraka" | "payfor" {
  return gateway.toLowerCase() as "stripe" | "albaraka" | "payfor";
}

/** True when the gateway needs raw card inputs rendered on our own checkout step. */
export function gatewayUsesOwnCardForm(gateway: ResolvedGateway): boolean {
  return gateway === "PAYFOR" || gateway === "ALBARAKA";
}
