/**
 * One-time backfill for monthly donations stuck at status=PAID, paidAt=null.
 *
 * Cause: the Stripe webhook used the legacy `invoice.subscription` field, which
 * was removed in API 2024-09-30. With apiVersion "2026-03-25.dahlia" the field
 * is undefined, so the invoice.payment_succeeded handler exited before writing
 * paidAt and incrementing campaign/category totals. The webhook is now fixed —
 * this script catches up the historical rows.
 *
 * For each stuck donation we look up the matching Stripe invoice. If Stripe
 * says it's paid, we set paidAt + run the campaign/category increments the
 * webhook should have done. If Stripe says it's void/uncollectible, we flip
 * the donation to FAILED. Anything else (open/draft) is left untouched.
 *
 * Run: tsx scripts/backfill-stripe-monthly-paid.ts
 */
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import { donationFieldEmpty, donationWhereAll } from "@/lib/donations/mongo-null";

const prisma = new PrismaClient();

const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.error("STRIPE_SECRET_KEY is not set");
  process.exit(1);
}
const stripe = new Stripe(stripeKey, { apiVersion: "2026-03-25.dahlia" });

// This script increments campaign.currentAmount and category.currentAmount, so a
// mistaken run misstates public fundraising totals. Default to reporting only and
// require an explicit --commit to write, matching backfill-stripe-renewal-donations.ts.
const COMMIT = process.argv.includes("--commit");

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

async function main() {
  // `paidAt: null` matched nothing here: on MongoDB these rows have the field
  // ABSENT, not null, and Prisma's `{ field: null }` only matches an explicit
  // null. That is why this script reported "0 candidates" and appeared to be a
  // no-op while 27 rows stayed stuck. `{ not: null }` is unaffected, so only the
  // paidAt predicate needs the helper. See lib/donations/mongo-null.ts.
  const candidates = await prisma.donation.findMany({
    where: donationWhereAll(
      {
        status: "PAID",
        subscriptionId: { not: null },
        provider: "STRIPE",
        providerOrderId: { not: null },
      },
      donationFieldEmpty("paidAt"),
    ),
    include: {
      items: true,
      categoryItems: true,
    },
  });

  console.log(`Found ${candidates.length} stuck monthly donation(s) to verify against Stripe.`);

  let markedPaid = 0;
  let markedFailed = 0;
  let stillPending = 0;
  let errored = 0;
  let skippedDuplicate = 0;

  for (const d of candidates) {
    try {
      const invoice = await stripe.invoices.retrieve(d.providerOrderId!);

      // A stuck row may already have a SETTLED twin for the same invoice: while the
      // webhook was live but still carrying the `paidAt: null` Mongo bug, it failed to
      // find the optimistic row and inserted a second donation instead — and that
      // insert already ran the campaign/category increments. Incrementing again here
      // would double-count real money, so such rows are reported and skipped rather
      // than settled. They need de-duplication, not a backfill.
      const settledTwin = await prisma.donation.findFirst({
        where: { providerOrderId: d.providerOrderId, id: { not: d.id }, NOT: donationFieldEmpty("paidAt") },
        select: { id: true },
      });
      if (settledTwin) {
        skippedDuplicate++;
        console.log(`SKIP  ${d.id} — settled twin ${settledTwin.id} already counted this invoice (${invoice.id})`);
        continue;
      }

      if (invoice.status === "paid") {
        const paidAt = invoice.status_transitions?.paid_at
          ? new Date(invoice.status_transitions.paid_at * 1000)
          : d.createdAt;
        const subId = getStripeSubscriptionIdFromInvoice(invoice);

        if (COMMIT) {
          await prisma.$transaction(async (tx) => {
            await tx.donation.update({
              where: { id: d.id },
              data: {
                status: "PAID",
                paidAt,
                providerAuthCode: subId ?? undefined,
                providerTxnResult: "Success",
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                providerRaw: invoice as any,
              },
            });

            for (const item of d.items) {
              await tx.campaign.update({
                where: { id: item.campaignId },
                data: { currentAmount: { increment: item.amountUSD ?? item.amount } },
              });
            }
            for (const item of d.categoryItems) {
              await tx.category.update({
                where: { id: item.categoryId },
                data: { currentAmount: { increment: item.amountUSD ?? item.amount } },
              });
            }
          },
          // Prisma's 5s default expired on a donation touching several campaigns,
          // which rolled the whole transaction back. The work is a handful of small
          // updates; the limit was wall-clock, not contention.
          { timeout: 30_000, maxWait: 15_000 });
        }

        markedPaid++;
        const delta = [
          ...d.items.map((i) => i.amountUSD ?? i.amount),
          ...d.categoryItems.map((i) => i.amountUSD ?? i.amount),
        ].reduce((a, b) => a + b, 0);
        console.log(`${COMMIT ? "PAID " : "would"} ${d.id} (invoice ${invoice.id}, paidAt ${paidAt.toISOString()}, totals +${delta})`);
      } else if (invoice.status === "void" || invoice.status === "uncollectible") {
        if (COMMIT) {
          await prisma.donation.update({
            where: { id: d.id },
            data: {
              status: "FAILED",
              providerErrorMessage: `Stripe invoice ${invoice.status}`,
              providerTxnResult: "Failed",
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              providerRaw: invoice as any,
            },
          });
        }
        markedFailed++;
        console.log(`${COMMIT ? "FAIL " : "would"} ${d.id} (invoice ${invoice.id}, status ${invoice.status})`);
      } else {
        stillPending++;
        console.log(`SKIP  ${d.id} (invoice ${invoice.id}, status ${invoice.status})`);
      }
    } catch (err) {
      errored++;
      console.error(`ERROR ${d.id} (providerOrderId=${d.providerOrderId}):`, (err as Error).message);
    }
  }

  console.log("");
  console.log(
    `Done${COMMIT ? "" : " (DRY RUN — no writes; pass --commit to apply)"}. ` +
    `Paid: ${markedPaid}, Failed: ${markedFailed}, Pending: ${stillPending}, ` +
    `SkippedDuplicate: ${skippedDuplicate}, Errors: ${errored}`
  );
  if (skippedDuplicate > 0) {
    console.log(
      `\n${skippedDuplicate} row(s) were skipped because a settled twin already counted that invoice. ` +
      `Those are duplicate donations, not missing money — de-duplicate them separately.`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
