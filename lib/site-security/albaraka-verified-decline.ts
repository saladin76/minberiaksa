import "server-only";
import { isIP } from "node:net";
import { recordVerifiedDonationFailure } from "@/lib/site-security/donation-abuse-store";

// Only unequivocal card/issuer declines, never gateway outages, unknown,
// authentication cancellation, 3DS pending, or generic processing errors.
export const ALBARAKA_CARD_DECLINE_CODES = new Set(["05", "51", "54", "57", "59"]);
export async function recordConfirmedAlbarakaSaleDecline(input: {
  responseCode: string;
  orderId: string;
  donation: { paidAt: Date | null; attribution?: unknown };
}): Promise<void> {
  if (process.env.DONATION_ABUSE_GUARD_ENABLED !== "true" ||
      input.donation.paidAt || !ALBARAKA_CARD_DECLINE_CODES.has(input.responseCode) ||
      !input.orderId) return;
  const value = input.donation.attribution;
  const ip = value && typeof value === "object" && !Array.isArray(value) && "client_ip" in value
    ? (value as {client_ip?: unknown}).client_ip : null;
  if (typeof ip !== "string" || !isIP(ip)) return;
  try {
    await recordVerifiedDonationFailure({
      ip, provider: "ALBARAKA", paymentId: input.orderId,
      providerEventId: input.orderId + ":" + input.responseCode,
      failure: "BANK_DECLINED",
    });
  } catch (error) {
    console.error("[donation-abuse] confirmed Albaraka decline unavailable", error instanceof Error ? error.message : "unknown");
  }
}
