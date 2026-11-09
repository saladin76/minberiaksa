import "server-only";
import { isIP } from "node:net";
import { recordVerifiedDonationFailure } from "@/lib/site-security/donation-abuse-store";

/**
 * Call only for an authenticated Stripe webhook event, after the invoice
 * path has been excluded and the donation has been looked up from the DB.
 * No browser-supplied claims and no pending/timeout events are eligible.
 */
export async function recordSignedStripeCardDecline(
  intent: {
    id: string;
    last_payment_error?: {
      type?: string | null;
      decline_code?: string | null;
      code?: string | null;
    } | null;
  },
  providerEventId: string,
  donation: { paidAt: Date | null; attribution?: unknown } | null,
): Promise<void> {
  if (process.env.DONATION_ABUSE_GUARD_ENABLED !== "true" || !donation || donation.paidAt)
    return;
  const error = intent.last_payment_error;
  if (error?.type !== "card_error" || !(error.decline_code || error.code === "card_declined")) return;
  const attribution = donation.attribution;
  const rawIp = attribution && typeof attribution === "object" && !Array.isArray(attribution) &&
    "client_ip" in attribution ? (attribution as { client_ip?: unknown }).client_ip : null;
  if (typeof rawIp !== "string" || !isIP(rawIp)) return;
  try {
    await recordVerifiedDonationFailure({
      ip: rawIp,
      provider: "STRIPE",
      paymentId: intent.id,
      providerEventId,
      failure: "BANK_DECLINED",
    });
  } catch (error) {
    // An anti-fraud storage outage must never cause signed webhook replays or
    // change the actual financial settlement of a donation.
    console.error("[donation-abuse] verified decline recording unavailable", error instanceof Error ? error.message : "unknown");
  }
}
