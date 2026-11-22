/**
 * Which gateway a given donation should be charged through.
 *
 * Three rails exist:
 *   - PAYFOR    Ziraat Katılım 3D Secure. Unchanged, opt-out only: it keeps
 *                exactly the case it always had (one-time TRY donations) as long
 *                as the admin leaves its switch on.
 *   - STRIPE    the original main gateway.
 *   - ALBARAKA  Albaraka Türk EPOS 3D Secure, an alternative main gateway.
 *
 * New recurring baskets use Albaraka 2D only. PayFor handles one-time TRY only.
 */


/** Gateway an admin can nominate as the main one in the dashboard. */
/** PAYFOR as main (2026-11-22, Albaraka outage E999): one-time card donations in every currency go through
 *  PayFor (the path Saudi donors already use); recurring stays on Albaraka; with PayFor's switch off it falls back
 *  to Albaraka, so the main gateway can never point at a disabled rail. */
export type MainGateway = "STRIPE" | "ALBARAKA" | "PAYFOR";

/** Gateway actually used to charge a specific donation. */
export type ResolvedGateway = "STRIPE" | "ALBARAKA" | "PAYFOR";

export const MAIN_GATEWAYS: readonly MainGateway[] = ["STRIPE", "ALBARAKA", "PAYFOR"] as const;

export function isMainGateway(value: unknown): value is MainGateway {
  return value === "STRIPE" || value === "ALBARAKA" || value === "PAYFOR";
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
  /**
   * New recurring donations create an Albaraka plan.
   * `ONE_TIME` is the only cadence eligible for PayFor.
   */
  donationType?: "ONE_TIME" | "DAILY" | "FRIDAY" | "MONTHLY" | null;
  /**
   * Set once a gateway has already failed and the donor was handed a Stripe
   * PaymentIntent to retry with  that forces Stripe for the rest of the attempt.
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
  if (donationType && donationType !== "ONE_TIME") return "ALBARAKA";
  if (forceStripe) return "STRIPE";
  // PayFor's case is unchanged from before Albaraka existed: an explicitly
  // one-time TRY donation, with the admin switch on.
  if (
    payforEnabled &&
    donationType === "ONE_TIME" &&
    String(currency || "").toUpperCase() === "TRY"
  ) {
    return "PAYFOR";
  }
  if (mainGateway === "PAYFOR") return payforEnabled ? "PAYFOR" : "ALBARAKA";
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
