import "server-only";

import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { dispatchDonationPaid } from "@/lib/events/dispatch";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" })
  : null;

/**
 * Self-heal a Stripe donation whose webhook has not landed: if Stripe already
 * has the PaymentIntent marked succeeded, stamp `paidAt` and increment the
 * campaign/category totals, then run the paid pipeline (documents, emails,
 * conversions). Idempotent — a `paidAt` guard inside the transaction prevents
 * a double increment if the webhook arrives between the lookup and the update.
 *
 * Extracted from `app/api/donations/[id]/route.ts` so the success page can
 * confirm the donation it is about to congratulate before issuing its
 * certificate: the documents need a confirmed donation, and a donor coming
 * back from Stripe usually arrives before the webhook does.
 */
export async function reconcileStripeDonation(donationId: string): Promise<void> {
  if (!stripe) return;
  const row = await prisma.donation.findUnique({
    where: { id: donationId },
    select: { provider: true, providerOrderId: true, paidAt: true },
  });
  if (!row || row.paidAt || row.provider !== "STRIPE" || !row.providerOrderId) return;
  if (!row.providerOrderId.startsWith("pi_")) return;

  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.retrieve(row.providerOrderId);
  } catch (err) {
    console.error("[donation reconcile] Stripe retrieve failed:", err);
    return;
  }
  if (intent.status !== "succeeded") return;

  try {
    let finalized = false;
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.donation.findUnique({
        where: { id: donationId },
        include: { items: true, categoryItems: true },
      });
      if (!fresh || fresh.paidAt) return;

      await tx.donation.update({
        where: { id: donationId },
        data: {
          status: "PAID",
          paidAt: new Date(),
          providerAuthCode: intent.id,
          providerTxnResult: "Success",
        },
      });
      for (const item of fresh.items) {
        await tx.campaign.update({
          where: { id: item.campaignId },
          data: { currentAmount: { increment: item.amountUSD ?? item.amount } },
        });
      }
      for (const item of fresh.categoryItems) {
        await tx.category.update({
          where: { id: item.categoryId },
          data: { currentAmount: { increment: item.amountUSD ?? item.amount } },
        });
      }
      finalized = true;
    });
    if (finalized) void dispatchDonationPaid(donationId);
  } catch (err) {
    console.error("[donation reconcile] Finalize failed:", err);
  }
}
