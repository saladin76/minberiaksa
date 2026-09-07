/**
 * Reconcile every monthly-subscription donation stuck in
 * "status=PAID + paidAt=null" — the state the dashboard shows as "قيد التأكيد".
 *
 * Why these rows exist
 * --------------------
 * Both checkout flows write the donation up front with `status:"PAID"` +
 * `paidAt:null` as an optimistic placeholder; the convention is that `paidAt`
 * is the real settled flag (the schema enum only has PAID|FAILED). The
 * provider webhook is supposed to flip `paidAt` once the charge settles.
 *
 * Several bugs prevented the webhook from doing that:
 *   • The Stripe webhook's idempotency check matched the unpaid placeholder
 *     row and exited without writing `paidAt` (now fixed in route.ts).
 *   • The Stripe Checkout Session flow writes `providerOrderId = "cs_…"`
 *     while the webhook looks up by `invoice.id ("in_…")`, so it failed to
 *     find the placeholder and created a NEW paid donation alongside it,
 *     leaving the original stranded as a phantom duplicate.
 *
 * What this script does (idempotent — safe to re-run)
 * ---------------------------------------------------
 *  For every stuck row we pick exactly ONE resolution:
 *
 *  1. DUPLICATE FAILED — there is a sibling donation in the SAME subscription
 *     that's already settled (paidAt != null) for what is clearly the same
 *     charge (same amount + currency, created within 24 h). The stuck row
 *     is the phantom from the old webhook bug. Mark it FAILED with a note;
 *     do NOT touch totals (the sibling already counted them).
 *
 *  2. STRIPE-VERIFIED SETTLE — the row is a real Stripe payment we can
 *     re-verify. If `providerOrderId` starts with "in_" we look up the
 *     invoice directly; if it starts with "cs_" we look up the Checkout
 *     Session and pull its invoice id. If Stripe confirms paid, set
 *     `paidAt` from the invoice's `paid_at` (or `created`) timestamp and run
 *     the campaign/category increments the webhook should have done.
 *
 *  3. STRIPE-VERIFIED FAILED — Stripe says the invoice is `void` or
 *     `uncollectible`. Flip donation to FAILED.
 *
 *  4. SUBSCRIPTION-BACKED SETTLE — non-Stripe row whose parent Subscription
 *     has `lastBillingDate` set (evidence the charge actually fired).
 *     `paidAt = donation.createdAt` and run the increments.
 *
 *  5. ABANDONED FAILED — older than 14 days, no provider evidence, parent
 *     Subscription never billed. The user walked away from checkout. Mark
 *     FAILED so it stops showing as "قيد التأكيد" forever.
 *
 *  6. SKIP — recent (<14 days) row that's still legitimately pending.
 *     Re-run later.
 *
 * Run with:  npx tsx scripts/backfill-subscription-donations-paidat.ts
 */
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";

const prisma = new PrismaClient();

const stripeKey = process.env.STRIPE_SECRET_KEY;
// Pin the same API version the runtime webhook uses. Cast through `any` because
// the Stripe SDK's LatestApiVersion type alias isn't exported in all versions.
const stripe = stripeKey
  ? new Stripe(stripeKey, { apiVersion: "2026-03-25.dahlia" as any })
  : null;

const ABANDON_AFTER_DAYS = 14;
const DUPLICATE_WINDOW_HOURS = 24;

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

type StuckDonation = Awaited<ReturnType<typeof loadStuck>>[number];

async function loadStuck() {
  return prisma.donation.findMany({
    where: {
      status: "PAID",
      paidAt: null,
      subscriptionId: { not: null },
    },
    include: {
      items: true,
      categoryItems: true,
    },
  });
}

/** Try to find an already-settled sibling donation that matches this one. */
async function findPaidSibling(donation: StuckDonation) {
  if (!donation.subscriptionId) return null;
  const windowMs = DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000;
  const lo = new Date(donation.createdAt.getTime() - windowMs);
  const hi = new Date(donation.createdAt.getTime() + windowMs);

  return prisma.donation.findFirst({
    where: {
      id: { not: donation.id },
      subscriptionId: donation.subscriptionId,
      status: "PAID",
      paidAt: { not: null },
      amount: donation.amount,
      currency: donation.currency,
      createdAt: { gte: lo, lte: hi },
    },
    select: { id: true, paidAt: true, providerOrderId: true },
    orderBy: { createdAt: "asc" },
  });
}

async function markDuplicateFailed(
  donation: StuckDonation,
  siblingId: string,
) {
  await prisma.donation.update({
    where: { id: donation.id },
    data: {
      status: "FAILED",
      providerErrorMessage: `Phantom duplicate of ${siblingId} (legacy webhook id mismatch). Totals were applied to the sibling, not this row.`,
      providerTxnResult: donation.providerTxnResult ?? "Failed",
    },
  });
}

async function markAbandonedFailed(donation: StuckDonation) {
  await prisma.donation.update({
    where: { id: donation.id },
    data: {
      status: "FAILED",
      providerErrorMessage:
        "Abandoned checkout — never settled and no recurring billing recorded.",
      providerTxnResult: donation.providerTxnResult ?? "Failed",
    },
  });
}

async function settleWithIncrements(
  donation: StuckDonation,
  paidAt: Date,
  patch: Partial<{
    providerAuthCode: string | null;
    providerTxnResult: string | null;
    providerRaw: unknown;
  }> = {},
) {
  await prisma.$transaction(async (tx) => {
    await tx.donation.update({
      where: { id: donation.id },
      data: {
        paidAt,
        providerAuthCode: donation.providerAuthCode ?? patch.providerAuthCode ?? null,
        providerTxnResult: donation.providerTxnResult ?? patch.providerTxnResult ?? "Success",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        providerRaw: (donation.providerRaw ?? (patch.providerRaw as any) ?? donation.providerRaw) as any,
      },
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

async function tryStripeVerify(donation: StuckDonation) {
  if (!stripe) return { handled: false as const };

  const orderId = donation.providerOrderId;
  if (!orderId) return { handled: false as const };

  let invoiceId: string | null = null;
  let invoice: Stripe.Invoice | null = null;

  try {
    if (orderId.startsWith("in_")) {
      invoiceId = orderId;
      invoice = await stripe.invoices.retrieve(orderId);
    } else if (orderId.startsWith("cs_")) {
      // Checkout Session — pull the invoice id from the expanded session.
      const sessionObj = await stripe.checkout.sessions.retrieve(orderId, {
        expand: ["invoice", "subscription.latest_invoice"],
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sessionAny = sessionObj as any;
      const inv = sessionAny.invoice;
      if (typeof inv === "string") {
        invoiceId = inv;
      } else if (inv && typeof inv === "object" && "id" in inv) {
        invoiceId = (inv as { id: string }).id;
        invoice = inv as Stripe.Invoice;
      } else {
        const subInvoice = sessionAny.subscription?.latest_invoice;
        if (typeof subInvoice === "string") {
          invoiceId = subInvoice;
        } else if (subInvoice && "id" in subInvoice) {
          invoiceId = (subInvoice as { id: string }).id;
          invoice = subInvoice as Stripe.Invoice;
        }
      }
      if (!invoice && invoiceId) {
        invoice = await stripe.invoices.retrieve(invoiceId);
      }
    }
  } catch (err) {
    console.error(`   ✗ Stripe lookup failed for donation ${donation.id}:`, err);
    return { handled: false as const };
  }

  if (!invoice) return { handled: false as const };

  if (invoice.status === "paid") {
    const paidAt = invoice.status_transitions?.paid_at
      ? new Date(invoice.status_transitions.paid_at * 1000)
      : new Date(invoice.created * 1000);
    await settleWithIncrements(donation, paidAt, {
      providerAuthCode: getStripeSubscriptionIdFromInvoice(invoice),
      providerTxnResult: "Success",
      providerRaw: invoice,
    });
    return { handled: true as const, action: "stripe-settled" as const };
  }
  if (invoice.status === "void" || invoice.status === "uncollectible") {
    await prisma.donation.update({
      where: { id: donation.id },
      data: {
        status: "FAILED",
        providerErrorMessage: `Invoice ${invoice.status} per Stripe`,
        providerTxnResult: "Failed",
      },
    });
    return { handled: true as const, action: "stripe-failed" as const };
  }

  // open / draft — truly pending; leave alone.
  return { handled: true as const, action: "stripe-open" as const };
}

async function main() {
  console.log("🔁 Reconciling stuck monthly-subscription donations…");

  const stuck = await loadStuck();
  console.log(`   Found ${stuck.length} stuck row(s) (status=PAID + paidAt=null + subscriptionId set)`);

  const counts = {
    duplicateFailed: 0,
    stripeSettled: 0,
    stripeFailed: 0,
    stripeOpen: 0,
    subscriptionSettled: 0,
    abandoned: 0,
    skipped: 0,
    errors: 0,
  };

  const now = Date.now();
  const abandonCutoff = now - ABANDON_AFTER_DAYS * 24 * 60 * 60 * 1000;

  for (const donation of stuck) {
    try {
      // 1. Is this a phantom duplicate of an already-settled sibling?
      const sibling = await findPaidSibling(donation);
      if (sibling) {
        await markDuplicateFailed(donation, sibling.id);
        counts.duplicateFailed += 1;
        continue;
      }

      // 2 + 3. Try to verify via the Stripe API.
      if (donation.provider === "STRIPE") {
        const result = await tryStripeVerify(donation);
        if (result.handled) {
          if (result.action === "stripe-settled") counts.stripeSettled += 1;
          else if (result.action === "stripe-failed") counts.stripeFailed += 1;
          else counts.stripeOpen += 1;
          continue;
        }
      }

      // 4. Non-Stripe row whose subscription was actually billed → settle.
      if (donation.subscriptionId) {
        const sub = await prisma.subscription.findUnique({
          where: { id: donation.subscriptionId },
          select: { lastBillingDate: true, createdAt: true },
        });
        if (sub?.lastBillingDate) {
          await settleWithIncrements(donation, donation.createdAt, {
            providerTxnResult: "Success (backfilled)",
          });
          counts.subscriptionSettled += 1;
          continue;
        }
      }

      // 5. Older than the abandon threshold with no evidence of payment → FAILED.
      if (donation.createdAt.getTime() < abandonCutoff) {
        await markAbandonedFailed(donation);
        counts.abandoned += 1;
        continue;
      }

      // 6. Recent and truly pending — re-run later.
      counts.skipped += 1;
    } catch (err) {
      console.error(`   ✗ Failed to reconcile donation ${donation.id}:`, err);
      counts.errors += 1;
    }
  }

  console.log("   ─ Resolution counts ─");
  console.log(`     Phantom duplicates marked FAILED:        ${counts.duplicateFailed}`);
  console.log(`     Stripe-verified, settled:                ${counts.stripeSettled}`);
  console.log(`     Stripe-verified, marked FAILED:          ${counts.stripeFailed}`);
  console.log(`     Stripe still open/draft (left alone):    ${counts.stripeOpen}`);
  console.log(`     Subscription-backed settled (paidAt=createdAt): ${counts.subscriptionSettled}`);
  console.log(`     Abandoned (>${ABANDON_AFTER_DAYS}d, marked FAILED):${" ".repeat(15)}${counts.abandoned}`);
  console.log(`     Skipped (recent, still legitimately pending):    ${counts.skipped}`);
  console.log(`     Errors (left alone):                              ${counts.errors}`);

  const remaining = await prisma.donation.count({
    where: { status: "PAID", paidAt: null, subscriptionId: { not: null } },
  });
  console.log(`   ${remaining} stuck row(s) remain after this run`);
  console.log("✅ Reconcile complete");
}

main()
  .catch((err) => {
    console.error("❌ Reconcile failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
