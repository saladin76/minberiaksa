/**
 * Read-only audit: compare every Stripe subscription invoice against the local Donation rows.
 *
 * Answers "which automatic (renewal) donations did we miss?" without changing anything.
 * Run: npx tsx scripts/audit-stripe-subscription-donations.ts [--json]
 */
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-03-25.dahlia" });
const asJson = process.argv.includes("--json");

export type MissingInvoice = {
  subscriptionDbId: string;
  stripeSubscriptionId: string;
  donorId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  amountPaid: number;
  currency: string;
  created: string;
  billingReason: string | null;
  isFirstInvoice: boolean;
};

async function main() {
  const subs = await prisma.subscription.findMany({
    where: { payforToken: { not: null } },
    select: { id: true, payforToken: true, donorId: true, status: true, amount: true, currency: true, createdAt: true },
  });

  const noToken = await prisma.subscription.count({ where: { payforToken: null } });

  let totalPaidInvoices = 0;
  let matched = 0;
  const missing: MissingInvoice[] = [];
  const unsettled: { subscriptionDbId: string; donationId: string; createdAt: string }[] = [];
  const notFoundInStripe: string[] = [];

  for (const sub of subs) {
    const stripeSubId = sub.payforToken!;
    if (!stripeSubId.startsWith("sub_")) continue;

    let invoices: Stripe.Invoice[] = [];
    try {
      const res = await stripe.invoices.list({ subscription: stripeSubId, limit: 100 });
      invoices = res.data;
    } catch {
      notFoundInStripe.push(stripeSubId);
      continue;
    }

    const paidInvoices = invoices
      .filter((inv) => inv.status === "paid" && (inv.amount_paid ?? 0) > 0)
      .sort((a, b) => (a.created ?? 0) - (b.created ?? 0));
    totalPaidInvoices += paidInvoices.length;

    const localDonations = await prisma.donation.findMany({
      where: { subscriptionId: sub.id },
      select: { id: true, providerOrderId: true, paidAt: true, status: true, createdAt: true },
    });
    const byOrderId = new Set(localDonations.map((d) => d.providerOrderId).filter(Boolean) as string[]);

    for (const d of localDonations) {
      if (d.status === "PAID" && !d.paidAt) {
        unsettled.push({ subscriptionDbId: sub.id, donationId: d.id, createdAt: d.createdAt.toISOString() });
      }
    }

    paidInvoices.forEach((inv, idx) => {
      if (byOrderId.has(inv.id!)) { matched += 1; return; }
      missing.push({
        subscriptionDbId: sub.id,
        stripeSubscriptionId: stripeSubId,
        donorId: sub.donorId,
        invoiceId: inv.id!,
        invoiceNumber: inv.number ?? null,
        amountPaid: (inv.amount_paid ?? 0) / 100,
        currency: (inv.currency ?? "usd").toUpperCase(),
        created: new Date((inv.created ?? 0) * 1000).toISOString(),
        billingReason: (inv.billing_reason as string) ?? null,
        isFirstInvoice: idx === 0,
      });
    });
  }

  const report = {
    subscriptionsWithStripeId: subs.length,
    subscriptionsWithoutStripeId: noToken,
    stripeSubscriptionsNotRetrievable: notFoundInStripe.length,
    totalPaidInvoicesInStripe: totalPaidInvoices,
    matchedLocally: matched,
    missingLocally: missing.length,
    missingFirstInvoices: missing.filter((m) => m.isFirstInvoice).length,
    missingRenewalInvoices: missing.filter((m) => !m.isFirstInvoice).length,
    missingValueByCurrency: missing.reduce<Record<string, number>>((acc, m) => {
      acc[m.currency] = Number(((acc[m.currency] ?? 0) + m.amountPaid).toFixed(2));
      return acc;
    }, {}),
    unsettledLocalRows: unsettled.length,
  };

  if (asJson) {
    console.log(JSON.stringify({ report, missing, unsettled }, null, 2));
  } else {
    console.log("\n=== STRIPE SUBSCRIPTION DONATION AUDIT ===");
    console.log(JSON.stringify(report, null, 2));
    console.log("\n--- first 25 missing invoices ---");
    for (const m of missing.slice(0, 25)) {
      console.log(`${m.created.slice(0, 10)}  ${m.invoiceId}  ${m.amountPaid} ${m.currency}  ${m.isFirstInvoice ? "FIRST" : "RENEWAL"}  reason=${m.billingReason}  sub=${m.subscriptionDbId}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
