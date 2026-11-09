import "server-only";
import { isIP } from "node:net";
import { verifyPayForResponseHash } from "@/lib/payfor";
import { recordVerifiedDonationFailure } from "@/lib/site-security/donation-abuse-store";

/** These are unambiguous issuer/card declines, not MPI (e.g. V034),
 * incomplete 3DS, expired sessions, gateway timeouts, or bank processing errors.
 */
const VERIFIED_PAYFOR_DECLINES = new Set(["05", "51", "54", "57", "59"]);
export async function recordSignedPayForDecline(
  response: Record<string, unknown>,
  donation: { paidAt: Date | null; providerOrderId?: string | null; attribution?: unknown },
): Promise<void> {
  if (process.env.DONATION_ABUSE_GUARD_ENABLED !== "true" || donation.paidAt) return;
  const orderId = String(response.OrderId ?? "");
  const code = String(response.ProcReturnCode ?? "");
  if (!orderId || !donation.providerOrderId || donation.providerOrderId !== orderId ||
      !VERIFIED_PAYFOR_DECLINES.has(code) ||
      !verifyPayForResponseHash(response, process.env.PAYFOR_MERCHANT_PASS)) return;
  const attribution = donation.attribution;
  const ip = attribution && typeof attribution === "object" && !Array.isArray(attribution) &&
    "client_ip" in attribution ? (attribution as {client_ip?: unknown}).client_ip : null;
  if (typeof ip !== "string" || !isIP(ip)) return;
  try {
    await recordVerifiedDonationFailure({
      ip, provider: "PAYFOR", paymentId: orderId,
      providerEventId: orderId + ":" + code,
      failure: "BANK_DECLINED",
    });
  } catch (error) {
    // Fraud logging must not cause an already-failed bank callback to retry
    // or alter the finance state machine.
    console.error("[donation-abuse] PayFor decline recording unavailable", error instanceof Error ? error.message : "unknown");
  }
}
