/**
 * Backfill the automatic (renewal) subscription donations that were never recorded.
 *
 * Context: the app's Stripe webhook endpoint was never registered in the live Stripe
 * account, so `invoice.payment_succeeded` never reached us. The FIRST charge of each
 * subscription still produced a Donation row (it is written optimistically at checkout),
 * but every automatic renewal after it exists only in Stripe. This script reads the
 * invoices back out of Stripe and creates the missing rows.
 *
 * For each missing paid invoice it creates a Donation that mirrors exactly what the
 * webhook would have written:
 *   - createdAt / paidAt  = the real invoice date (NOT now) so it lands in the right
 *                           reporting period on every createdAt-ranged dashboard
 *   - billingReason       = Stripe's own subscription_create / subscription_cycle
 *   - items/categoryItems = copied from the parent Subscription
 *   - referralId, locale  = carried from the parent Subscription
 * and increments the matching campaign/category `currentAmount`, which is where the
 * dashboard cards and progress bars read their totals from.
 *
 * Also stamps `billingReason` on already-matched rows so the first-vs-renewal label
 * works retroactively for donations that were recorded correctly.
 *
 * DRY RUN BY DEFAULT. Pass --commit to actually write.
 *   npx tsx scripts/backfill-stripe-renewal-donations.ts
 *   npx tsx scripts/backfill-stripe-renewal-donations.ts --commit
 *
 * Idempotent: a Donation whose providerOrderId already equals the invoice id is skipped,
 * so re-running never duplicates a charge or double-increments a campaign.
 */
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";
import { getDonorCountryCodeForSnapshot } from "@/lib/donations/donor-country-code";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-03-25.dahlia" });
const COMMIT = process.argv.includes("--commit");

type Created = {
  invoiceId: string;
  subscriptionDbId: string;
  donorId: string;
  amount: number;
  currency: string;
  amountUSD: number | null;
  date: string;
  billingReason: string | null;
};

async function main() {
  const subs = await prisma.subscription.findMany({
    where: { payforToken: { not: null } },
    include: { items: true, categoryItems: true },
  });

  const created: Created[] = [];
  const campaignIncrements = new Map<string, number>();
  const categoryIncrements = new Map<string, number>();
  let alreadyPresent = 0;
  let billingReasonStamped = 0;
  let skippedNoStripeSub = 0;

  for (const sub of subs) {
    const stripeSubId = sub.payforToken!;
    if (!stripeSubId.startsWith("sub_")) { skippedNoStripeSub += 1; continue; }

    let invoices: Stripe.Invoice[];
    try {
      const res = await stripe.invoices.list({ subscription: stripeSubId, limit: 100 });
      invoices = res.data;
    } catch {
      skippedNoStripeSub += 1;
      continue;
    }

    const paidInvoices = invoices
      .filter((inv) => inv.status === "paid" && (inv.amount_paid ?? 0) > 0)
      .sort((a, b) => (a.created ?? 0) - (b.created ?? 0));
    if (!paidInvoices.length) continue;

    const donorCountry = (await getDonorCountryCodeForSnapshot(prisma, sub.donorId)) ?? undefined;
    const fees = (sub.amount + sub.teamSupport) * 0.03;
    const finalTotal = sub.amount + sub.teamSupport + (sub.coverFees ? fees : 0);

    for (const inv of paidInvoices) {
      const billingReason = (inv.billing_reason as string) ?? null;
      const existing = await prisma.donation.findFirst({
        where: { subscriptionId: sub.id, providerOrderId: inv.id },
        select: { id: true, billingReason: true },
      });

      if (existing) {
        alreadyPresent += 1;
        // Retro-label rows that were recorded but predate billingReason.
        if (!existing.billingReason && billingReason) {
          billingReasonStamped += 1;
          if (COMMIT) {
            await prisma.donation.update({ where: { id: existing.id }, data: { billingReason } });
          }
        }
        continue;
      }

      const invoiceDate = new Date((inv.created ?? 0) * 1000);
      created.push({
        invoiceId: inv.id!,
        subscriptionDbId: sub.id,
        donorId: sub.donorId,
        amount: sub.amount,
        currency: sub.currency,
        amountUSD: sub.amountUSD ?? null,
        date: invoiceDate.toISOString(),
        billingReason,
      });

      for (const item of sub.items) {
        const v = item.amountUSD ?? item.amount;
        campaignIncrements.set(item.campaignId, (campaignIncrements.get(item.campaignId) ?? 0) + v);
      }
      for (const item of sub.categoryItems) {
        const v = item.amountUSD ?? item.amount;
        categoryIncrements.set(item.categoryId, (categoryIncrements.get(item.categoryId) ?? 0) + v);
      }

      if (COMMIT) {
        await prisma.$transaction(async (tx) => {
          // Re-check inside the transaction so concurrent runs can't duplicate.
          const dupe = await tx.donation.findFirst({
            where: { subscriptionId: sub.id, providerOrderId: inv.id },
            select: { id: true },
          });
          if (dupe) return;

          await tx.donation.create({
            data: {
              amount: sub.amount,
              amountUSD: sub.amountUSD ?? sub.amount,
              teamSupport: sub.teamSupport,
              coverFees: sub.coverFees,
              currency: sub.currency,
              fees: sub.coverFees ? fees : 0,
              totalAmount: finalTotal,
              status: "PAID",
              paidAt: invoiceDate,
              createdAt: invoiceDate,
              billingReason,
              donorCountryCode: donorCountry,
              donorId: sub.donorId,
              subscriptionId: sub.id,
              referralId: sub.referralId ?? undefined,
              paymentMethod: "CARD",
              provider: "STRIPE",
              providerOrderId: inv.id,
              providerAuthCode: stripeSubId,
              providerTxnResult: "Success",
              providerRaw: inv as any,
              items: sub.items.length
                ? { create: sub.items.map((i) => ({ campaignId: i.campaignId, amount: i.amount, amountUSD: i.amountUSD })) }
                : undefined,
              categoryItems: sub.categoryItems.length
                ? { create: sub.categoryItems.map((i) => ({ categoryId: i.categoryId, amount: i.amount, amountUSD: i.amountUSD })) }
                : undefined,
            },
          });

          for (const item of sub.items) {
            await tx.campaign.update({
              where: { id: item.campaignId },
              data: { currentAmount: { increment: item.amountUSD ?? item.amount } },
            });
          }
          for (const item of sub.categoryItems) {
            await tx.category.update({
              where: { id: item.categoryId },
              data: { currentAmount: { increment: item.amountUSD ?? item.amount } },
            });
          }
        }, {
          // The default 5s is not enough against the remote Atlas cluster: one row can
          // touch several campaign/category documents. A timeout mid-way rolls the whole
          // donation back (verified), so the only cost of a low limit is a failed run.
          maxWait: 20_000,
          timeout: 120_000,
        });
      }
    }

    // Keep the subscription's billing dates consistent with its newest paid invoice.
    if (COMMIT) {
      const newest = paidInvoices[paidInvoices.length - 1];
      const lastBilling = new Date((newest.created ?? 0) * 1000);
      if (!sub.lastBillingDate || sub.lastBillingDate < lastBilling) {
        await prisma.subscription.update({ where: { id: sub.id }, data: { lastBillingDate: lastBilling } });
      }
    }
  }

  const byCurrency = created.reduce<Record<string, { count: number; amount: number }>>((acc, c) => {
    const e = acc[c.currency] ?? { count: 0, amount: 0 };
    e.count += 1;
    e.amount = Number((e.amount + c.amount).toFixed(2));
    acc[c.currency] = e;
    return acc;
  }, {});

  // Reconcile from STRIPE's side as well. The loop above can only see invoices belonging to a
  // subscription we already have a `payforToken` for, so a Stripe subscription whose DB row was
  // never created (or was deleted) is invisible to it — it reports a clean "nothing missing"
  // while real paid invoices sit unrecorded. This pass enumerates every paid invoice in the
  // account and reports the ones with no matching Donation, whatever subscription they belong to.
  const orphanInvoices: Array<{ id: string; date: string; amount: number; currency: string; billingReason: string | null; stripeSubId: string | null }> = [];
  for await (const inv of stripe.invoices.list({ limit: 100 })) {
    if (inv.status !== "paid" || (inv.amount_paid ?? 0) <= 0) continue;
    const match = await prisma.donation.findFirst({ where: { providerOrderId: inv.id }, select: { id: true } });
    if (match) continue;
    const parent = (inv as unknown as { parent?: { subscription_details?: { subscription?: string | { id: string } } } }).parent;
    const rawSub = parent?.subscription_details?.subscription ?? null;
    orphanInvoices.push({
      id: inv.id ?? "",
      date: new Date((inv.created ?? 0) * 1000).toISOString().slice(0, 10),
      amount: (inv.amount_paid ?? 0) / 100,
      currency: (inv.currency ?? "").toUpperCase(),
      billingReason: (inv.billing_reason as string) ?? null,
      stripeSubId: typeof rawSub === "string" ? rawSub : (rawSub?.id ?? null),
    });
  }

  console.log(`\n=== ${COMMIT ? "COMMITTED" : "DRY RUN (no writes — pass --commit to apply)"} ===`);
  console.log(JSON.stringify({
    subscriptionsScanned: subs.length,
    skippedNoStripeSub,
    unmatchedPaidInvoicesInStripe: orphanInvoices.length,
    invoicesAlreadyRecorded: alreadyPresent,
    donationsCreated: created.length,
    renewalsCreated: created.filter((c) => c.billingReason !== "subscription_create").length,
    signupChargesCreated: created.filter((c) => c.billingReason === "subscription_create").length,
    billingReasonStampedOnExisting: billingReasonStamped,
    createdByCurrency: byCurrency,
    campaignsToIncrement: campaignIncrements.size,
    categoriesToIncrement: categoryIncrements.size,
    totalCampaignIncrementUSD: Number([...campaignIncrements.values()].reduce((a, b) => a + b, 0).toFixed(2)),
  }, null, 2));

  if (orphanInvoices.length) {
    // Deliberately reported, never auto-created: these invoices belong to Stripe subscriptions
    // with no DB row, so there is no donor, campaign or category to attribute them to. Writing
    // them blind would invent attribution. Decide per subscription, then relink or cancel.
    console.log(`\n!!! ${orphanInvoices.length} PAID Stripe invoice(s) have NO Donation row and could not be attributed:`);
    for (const o of orphanInvoices) {
      console.log(`   ${o.id} ${o.date} ${o.amount} ${o.currency} reason=${o.billingReason ?? "-"} stripeSub=${o.stripeSubId ?? "-"}`);
    }
    const subsAffected = new Set(orphanInvoices.map((o) => o.stripeSubId ?? "-"));
    console.log(`   across ${subsAffected.size} Stripe subscription(s): ${[...subsAffected].join(", ")}`);
  }

  if (created.length) {
    console.log("\n--- donations " + (COMMIT ? "created" : "that would be created") + " ---");
    for (const c of created) {
      console.log(`${c.date.slice(0, 10)}  ${c.amount} ${c.currency}  ${c.billingReason}  inv=${c.invoiceId}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
