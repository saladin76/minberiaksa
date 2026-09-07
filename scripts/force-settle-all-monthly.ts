/**
 * Force every monthly-subscription donation into the "paid & counted" state so
 * it contributes to MRR. Unlike the conservative reconciliation script, this
 * one settles rows even when the provider hasn't confirmed payment.
 *
 * Per-row strategy
 *  1. Already PAID + paidAt set → no-op.
 *  2. STRIPE row → look up the invoice/session. If Stripe confirms paid use
 *     that timestamp; otherwise force `paidAt = donation.createdAt`.
 *  3. Anything else (FAILED rows, no-provider rows, etc.) → flip to PAID
 *     with `paidAt = donation.createdAt` and a note describing the override.
 *
 * Whenever this script transitions a row INTO "PAID + paidAt set", it also
 * applies the per-campaign / per-category increments the webhook would have
 * applied — so totals update in lockstep. Rows that were already paid are
 * skipped so we don't double-count.
 *
 * Run with:  npx tsx scripts/force-settle-all-monthly.ts
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import Stripe from "stripe";

const prisma = new PrismaClient();
const stripeKey = process.env.STRIPE_SECRET_KEY;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: "2026-03-25.dahlia" as any }) : null;

function getStripeSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromParent = (invoice as any).parent?.subscription_details?.subscription;
  if (typeof fromParent === "string") return fromParent;
  if (fromParent && typeof fromParent === "object" && "id" in fromParent) {
    return (fromParent as { id: string }).id;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const legacy = (invoice as any).subscription;
  return typeof legacy === "string" ? legacy : null;
}

type Donation = Prisma.DonationGetPayload<{
  include: { items: true; categoryItems: true };
}>;

async function fetchStripeInvoice(donation: Donation): Promise<Stripe.Invoice | null> {
  if (!stripe || !donation.providerOrderId) return null;
  const orderId = donation.providerOrderId;
  try {
    if (orderId.startsWith("in_")) {
      return await stripe.invoices.retrieve(orderId);
    }
    if (orderId.startsWith("cs_")) {
      const sessionObj = await stripe.checkout.sessions.retrieve(orderId, {
        expand: ["invoice", "subscription.latest_invoice"],
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sessionAny = sessionObj as any;
      const inv = sessionAny.invoice;
      if (inv && typeof inv === "object" && "id" in inv) return inv as Stripe.Invoice;
      if (typeof inv === "string") return await stripe.invoices.retrieve(inv);
      const subInvoice = sessionAny.subscription?.latest_invoice;
      if (subInvoice && typeof subInvoice === "object" && "id" in subInvoice) return subInvoice as Stripe.Invoice;
      if (typeof subInvoice === "string") return await stripe.invoices.retrieve(subInvoice);
    }
  } catch (err) {
    console.error(`   ✗ Stripe lookup failed for ${donation.id}:`, (err as Error).message);
  }
  return null;
}

async function applyIncrementsAndSettle(
  donation: Donation,
  paidAt: Date,
  data: Prisma.DonationUpdateInput,
) {
  await prisma.$transaction(async (tx) => {
    await tx.donation.update({
      where: { id: donation.id },
      data: { ...data, status: "PAID", paidAt },
    });
    for (const item of donation.items) {
      await tx.campaign.update({
        where: { id: item.campaignId },
        data: { currentAmount: { increment: item.amountUSD ?? item.amount } },
      });
    }
    for (const item of donation.categoryItems) {
      await tx.category.update({
        where: { id: item.categoryId },
        data: { currentAmount: { increment: item.amountUSD ?? item.amount } },
      });
    }
    if (donation.subscriptionId) {
      const sub = await tx.subscription.findUnique({
        where: { id: donation.subscriptionId },
        select: { lastBillingDate: true },
      });
      if (!sub?.lastBillingDate || sub.lastBillingDate < paidAt) {
        await tx.subscription.update({
          where: { id: donation.subscriptionId },
          data: { lastBillingDate: paidAt, status: "ACTIVE" },
        });
      }
    }
  });
}

async function main() {
  console.log("🚀 Force-settling every monthly-subscription donation…");

  // Mongo+Prisma quirk: `paidAt: null` ONLY matches rows where the field is
  // literally `null`. Rows where the field is unset (`{ $exists: false }`) are
  // skipped silently. We need both — use `isSet: false` to catch the unset case.
  const candidates = await prisma.donation.findMany({
    where: {
      subscriptionId: { not: null },
      OR: [
        { status: { not: "PAID" } },
        { paidAt: null },
        { paidAt: { isSet: false } },
      ],
    },
    include: { items: true, categoryItems: true },
  });

  console.log(`   ${candidates.length} row(s) need work`);

  const tallies = {
    stripeVerifiedPaid: 0,
    stripeForceSettled: 0,
    failedFlippedToPaid: 0,
    noProviderForceSettled: 0,
    errors: 0,
  };

  for (const donation of candidates) {
    try {
      const fallbackPaidAt = donation.createdAt;
      const note = "Force-settled by admin backfill so the donation contributes to MRR.";

      if (donation.provider === "STRIPE") {
        const invoice = await fetchStripeInvoice(donation);
        if (invoice && invoice.status === "paid") {
          const paidAt = invoice.status_transitions?.paid_at
            ? new Date(invoice.status_transitions.paid_at * 1000)
            : new Date(invoice.created * 1000);
          await applyIncrementsAndSettle(donation, paidAt, {
            providerAuthCode:
              donation.providerAuthCode ?? getStripeSubscriptionIdFromInvoice(invoice),
            providerTxnResult: donation.providerTxnResult ?? "Success",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            providerRaw: (donation.providerRaw ?? (invoice as any)) as any,
            providerErrorMessage: null,
          });
          tallies.stripeVerifiedPaid += 1;
          continue;
        }

        // Stripe says it's not paid (open/void/uncollectible/declined) — force anyway.
        const wasFailed = donation.status === "FAILED";
        await applyIncrementsAndSettle(donation, fallbackPaidAt, {
          providerTxnResult: "Success (force-settled)",
          providerErrorMessage: `${note}${donation.providerErrorMessage ? ` Previous error: ${donation.providerErrorMessage}` : ""}`,
        });
        if (wasFailed) tallies.failedFlippedToPaid += 1;
        else tallies.stripeForceSettled += 1;
        continue;
      }

      // Non-Stripe row: nothing to verify — just settle.
      const wasFailed = donation.status === "FAILED";
      await applyIncrementsAndSettle(donation, fallbackPaidAt, {
        providerTxnResult: "Success (force-settled)",
        providerErrorMessage: `${note}${donation.providerErrorMessage ? ` Previous error: ${donation.providerErrorMessage}` : ""}`,
      });
      if (wasFailed) tallies.failedFlippedToPaid += 1;
      else tallies.noProviderForceSettled += 1;
    } catch (err) {
      console.error(`   ✗ Failed to settle ${donation.id}:`, err);
      tallies.errors += 1;
    }
  }

  console.log("   ─ Results ─");
  console.log(`     Stripe-verified PAID:            ${tallies.stripeVerifiedPaid}`);
  console.log(`     Stripe force-settled (Stripe said not-paid): ${tallies.stripeForceSettled}`);
  console.log(`     FAILED rows flipped to PAID:     ${tallies.failedFlippedToPaid}`);
  console.log(`     Non-Stripe force-settled:        ${tallies.noProviderForceSettled}`);
  console.log(`     Errors (left as-is):             ${tallies.errors}`);

  const remaining = await prisma.donation.count({
    where: {
      subscriptionId: { not: null },
      OR: [
        { status: { not: "PAID" } },
        { paidAt: null },
        { paidAt: { isSet: false } },
      ],
    },
  });
  console.log(`   ${remaining} row(s) still not in MRR`);
  console.log("✅ Done");
}

main()
  .catch((err) => {
    console.error("❌ Force-settle failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
