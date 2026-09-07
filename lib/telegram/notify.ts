import { prisma } from "@/lib/prisma";
import { tgNotify } from "./client";
import { formatDonationNotification, type FormattableDonation } from "./format";

/** Prisma select that yields a {@link FormattableDonation}. */
export const DONATION_NOTIFY_SELECT = {
  id: true,
  amount: true,
  amountUSD: true,
  currency: true,
  totalAmount: true,
  teamSupport: true,
  fees: true,
  status: true,
  paidAt: true,
  createdAt: true,
  subscriptionId: true,
  provider: true,
  providerOrderId: true,
  providerErrorMessage: true,
  // Both feed the Arabic failure-reason mapper: PayFor puts the only real signal
  // in the return code (its message is always the useless "Payment failed"),
  // and Stripe's stable decline_code lives inside the raw payload.
  providerProcReturnCode: true,
  providerRaw: true,
  paymentMethod: true,
  donorCountryCode: true,
  attribution: true,
  donorId: true,
  donor: { select: { name: true, email: true, phone: true } },
  items: { select: { campaign: { select: { title: true } } } },
  categoryItems: { select: { category: { select: { name: true } } } },
  referral: { select: { code: true, name: true } },
} as const;

async function loadDonation(donationId: string): Promise<FormattableDonation | null> {
  try {
    const row = await prisma.donation.findUnique({
      where: { id: donationId },
      select: DONATION_NOTIFY_SELECT,
    });
    if (!row) return null;
    return row as unknown as FormattableDonation;
  } catch (err) {
    console.error("[telegram] loadDonation failed:", err);
    return null;
  }
}

/**
 * True when this donation is the donor's first — they have no OTHER successful
 * donation. Excluding the current row by id keeps the answer correct whether
 * that row is already PAID (success card) or FAILED (a brand-new donor whose
 * first attempt bounced), and mirrors the `paidCount === 1` rule that
 * `dispatchDonationPaid` uses to decide FIRST_DONATION.
 */
async function isFirstTimeDonor(donorId: string | undefined, donationId: string): Promise<boolean> {
  if (!donorId) return false;
  try {
    const priorPaid = await prisma.donation.count({
      where: { donorId, status: "PAID", id: { not: donationId } },
    });
    return priorPaid === 0;
  } catch (err) {
    // A missing star is better than a missing notification.
    console.error("[telegram] isFirstTimeDonor failed:", err);
    return false;
  }
}

/**
 * Fire-and-forget notification for a donation event. Errors are swallowed —
 * the bot must never break the payment webhook. Call as `void notifyDonationEvent(...)`.
 */
export async function notifyDonationEvent(
  event: "DONATION_PAID" | "DONATION_FAILED" | "FIRST_DONATION",
  donationId: string
): Promise<void> {
  try {
    // FIRST_DONATION fires alongside DONATION_PAID. It used to post its own
    // banner, which meant every new donor produced two Telegram messages. The
    // fact is now carried by a ⭐ on the donor line of the single card below,
    // so this event emits nothing at all.
    if (event === "FIRST_DONATION") return;

    const donation = await loadDonation(donationId);
    if (!donation) return;

    const text = formatDonationNotification(donation, {
      isNewDonor: await isFirstTimeDonor(donation.donorId, donationId),
    });
    await tgNotify(text, {
      // Failed donations should ping loudly; successful ones can be quieter at scale.
      silent: false,
      disablePreview: true,
    });
  } catch (err) {
    console.error(`[telegram] notifyDonationEvent ${event} ${donationId} failed:`, err);
  }
}
