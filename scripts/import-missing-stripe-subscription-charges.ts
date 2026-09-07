/**
 * Reconcile this app's SUBSCRIPTION charges against live Stripe, from Stripe's side.
 *
 * Why this exists alongside backfill-stripe-renewal-donations.ts: that script walks
 * DB subscriptions that already carry a Stripe subscription id (`payforToken`) and reads
 * their invoices. It is therefore blind to any charge whose DB subscription was never
 * created, was deleted, or was never linked. This script starts from Stripe instead, so
 * nothing can hide from it.
 *
 * IMPORTANT — scope. The Stripe account also contains a PREVIOUS donation platform's
 * history: ~12.3k charges total, ~6.8k of them with no metadata and metadata keys like
 * "Donation Post ID" / "Sequential ID" (a WordPress-era plugin), going back to 2024-09-18.
 * This app's own data starts 2026-04-22. Importing all of that would invent thousands of
 * donations with no donor, campaign or category. So this script deliberately handles ONLY
 * charges that are:
 *   - created on/after APP_START, and
 *   - described by Stripe as "Subscription creation"/"Subscription update" (this app's
 *     recurring flow), and
 *   - payable to a donor whose email already resolves to a User in this database.
 * Bare one-time charges are reported as a count and left alone — see NOTE at the end.
 *
 * Two outcomes per charge:
 *   LINK   — a donation for that donor/amount/currency already exists within ±2 days but
 *            has no `providerOrderId`. It is not missing, just unlinked; stamp the charge
 *            id on it so it reconciles cleanly from now on. No money changes.
 *   CREATE — no such donation exists. Create it, mirroring what the webhook would have
 *            written, and copy items from the donor's matching Subscription so campaign
 *            attribution is real rather than invented. Campaign/category currentAmount is
 *            incremented only when items were actually copied.
 *
 * DRY RUN BY DEFAULT. Pass --commit to write.
 *   npx tsx scripts/import-missing-stripe-subscription-charges.ts
 *   npx tsx scripts/import-missing-stripe-subscription-charges.ts --commit
 *
 * Idempotent: a charge whose id is already a `providerOrderId` is skipped entirely.
 */
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";
import { getDonorCountryCodeForSnapshot } from "@/lib/donations/donor-country-code";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-03-25.dahlia" });
const COMMIT = process.argv.includes("--commit");
/** First donation in this database — anything older belongs to the previous platform. */
const APP_START = Math.floor(Date.parse("2026-04-22T00:00:00Z") / 1000);
const NEAR_DAYS = 2;

type Row = { chargeId: string; date: string; amount: number; currency: string; email: string; donorId?: string; subId?: string; note?: string };

async function main() {
  const charges: Stripe.Charge[] = [];
  for await (const c of stripe.charges.list({ limit: 100, created: { gte: APP_START } })) charges.push(c);
  const succeeded = charges.filter((c) => c.status === "succeeded" && !c.refunded);

  const known = new Set(
    (await prisma.donation.findMany({ select: { providerOrderId: true } }))
      .map((d) => d.providerOrderId)
      .filter(Boolean) as string[]
  );

  const isUnmatched = (c: Stripe.Charge) => {
    const pi = typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent?.id;
    return !(pi && known.has(pi)) && !known.has(c.id);
  };
  const unmatched = succeeded.filter(isUnmatched);
  const subCharges = unmatched.filter((c) => /Subscription/i.test(c.description ?? ""));
  const bareCharges = unmatched.filter((c) => !/Subscription/i.test(c.description ?? ""));

  const linked: Row[] = [];
  const createdRows: Row[] = [];
  const skippedNoUser: Row[] = [];
  const skippedNoSubscription: Row[] = [];
  const campaignIncrements = new Map<string, number>();
  const categoryIncrements = new Map<string, number>();

  for (const c of subCharges) {
    const email = c.billing_details?.email ?? c.receipt_email ?? "";
    const amount = (c.amount ?? 0) / 100;
    const currency = c.currency.toUpperCase();
    const when = new Date((c.created ?? 0) * 1000);
    const row: Row = { chargeId: c.id, date: when.toISOString().slice(0, 10), amount, currency, email };

    const user = email ? await prisma.user.findFirst({ where: { email }, select: { id: true } }) : null;
    if (!user) { skippedNoUser.push(row); continue; }
    row.donorId = user.id;

    // Already recorded, just never linked back to Stripe.
    const lo = new Date(when.getTime() - NEAR_DAYS * 86400000);
    const hi = new Date(when.getTime() + NEAR_DAYS * 86400000);
    const existing = await prisma.donation.findFirst({
      where: { donorId: user.id, amount, currency, createdAt: { gte: lo, lte: hi } },
      select: { id: true, providerOrderId: true },
    });
    if (existing) {
      if (!existing.providerOrderId) {
        linked.push({ ...row, note: `link -> donation ${existing.id}` });
        if (COMMIT) {
          await prisma.donation.update({
            where: { id: existing.id },
            data: { providerOrderId: c.id, provider: "STRIPE", providerTxnResult: "Success" },
          });
        }
      }
      continue; // already present either way — never create a second row
    }

    // Truly missing. Attribute it to the donor's matching subscription so the money lands
    // on the right campaign instead of floating unattributed.
    const sub =
      (await prisma.subscription.findFirst({
        where: { donorId: user.id, amount, currency },
        include: { items: true, categoryItems: true },
        orderBy: { createdAt: "desc" },
      })) ??
      (await prisma.subscription.findFirst({
        where: { donorId: user.id },
        include: { items: true, categoryItems: true },
        orderBy: { createdAt: "desc" },
      }));
    if (!sub) { skippedNoSubscription.push(row); continue; }
    row.subId = sub.id;
    // Only an exact amount+currency match is trustworthy enough to inherit campaign
    // attribution. On a fallback we still record the transaction — the user needs every
    // charge visible in the tables — but we do NOT copy items or touch campaign
    // currentAmount, because guessing the campaign is worse than leaving it unattributed.
    const exact = sub.amount === amount && sub.currency === currency;
    row.note = exact ? "exact-match — attributed" : "fallback — recorded WITHOUT campaign attribution";

    const fees = (sub.amount + sub.teamSupport) * 0.03;
    const finalTotal = amount + sub.teamSupport + (sub.coverFees ? fees : 0);
    // The charge is the source of truth for the money; the subscription only supplies
    // attribution and the surrounding flags.
    const amountUSD = currency === "USD" ? amount : (sub.amountUSD && sub.amount ? (amount * sub.amountUSD) / sub.amount : null);

    createdRows.push(row);
    const attributeItems = exact ? sub.items : [];
    const attributeCategories = exact ? sub.categoryItems : [];
    for (const i of attributeItems) campaignIncrements.set(i.campaignId, (campaignIncrements.get(i.campaignId) ?? 0) + (i.amountUSD ?? i.amount));
    for (const i of attributeCategories) categoryIncrements.set(i.categoryId, (categoryIncrements.get(i.categoryId) ?? 0) + (i.amountUSD ?? i.amount));

    if (COMMIT) {
      const donorCountry = (await getDonorCountryCodeForSnapshot(prisma, sub.donorId)) ?? undefined;
      await prisma.$transaction(async (tx) => {
        const dupe = await tx.donation.findFirst({ where: { providerOrderId: c.id }, select: { id: true } });
        if (dupe) return;
        await tx.donation.create({
          data: {
            amount,
            amountUSD: amountUSD ?? amount,
            teamSupport: sub.teamSupport,
            coverFees: sub.coverFees,
            currency,
            fees: sub.coverFees ? fees : 0,
            totalAmount: finalTotal,
            status: "PAID",
            paidAt: when,
            createdAt: when,
            billingReason: /creation/i.test(c.description ?? "") ? "subscription_create" : "subscription_cycle",
            donorCountryCode: donorCountry,
            donorId: sub.donorId,
            subscriptionId: sub.id,
            referralId: sub.referralId ?? undefined,
            paymentMethod: "CARD",
            provider: "STRIPE",
            providerOrderId: c.id,
            providerTxnResult: "Success",
            providerRaw: c as never,
            items: attributeItems.length
              ? { create: attributeItems.map((i) => ({ campaignId: i.campaignId, amount: i.amount, amountUSD: i.amountUSD })) }
              : undefined,
            categoryItems: attributeCategories.length
              ? { create: attributeCategories.map((i) => ({ categoryId: i.categoryId, amount: i.amount, amountUSD: i.amountUSD })) }
              : undefined,
          },
        });
        for (const i of attributeItems) {
          await tx.campaign.update({ where: { id: i.campaignId }, data: { currentAmount: { increment: i.amountUSD ?? i.amount } } });
        }
        for (const i of attributeCategories) {
          await tx.category.update({ where: { id: i.categoryId }, data: { currentAmount: { increment: i.amountUSD ?? i.amount } } });
        }
      }, { maxWait: 20_000, timeout: 120_000 });
    }
  }

  const money = (rows: Row[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.currency, (m.get(r.currency) ?? 0) + r.amount);
    return [...m.entries()].sort().map(([k, v]) => `${v.toFixed(2)} ${k}`).join(", ") || "-";
  };

  console.log(`\n=== ${COMMIT ? "COMMITTED" : "DRY RUN (no writes — pass --commit to apply)"} ===`);
  console.log(JSON.stringify({
    appEraChargesScanned: succeeded.length,
    unmatchedByProviderOrderId: unmatched.length,
    subscriptionFlowCharges: subCharges.length,
    linkedExistingDonations: linked.length,
    donationsCreated: createdRows.length,
    skippedPayerNotInDb: skippedNoUser.length,
    skippedNoSubscriptionToAttributeTo: skippedNoSubscription.length,
    createdValue: money(createdRows),
    campaignsIncremented: campaignIncrements.size,
    categoriesIncremented: categoryIncrements.size,
    bareOneTimeChargesLeftAlone: bareCharges.length,
  }, null, 2));

  if (linked.length) {
    console.log(`\nLINKED (already in DB, stamped with the Stripe charge id — no money changed):`);
    for (const r of linked) console.log(`   ${r.chargeId} ${r.date} ${r.amount} ${r.currency} ${r.email} ${r.note}`);
  }
  if (createdRows.length) {
    console.log(`\nCREATED (were genuinely missing):`);
    for (const r of createdRows) console.log(`   ${r.chargeId} ${r.date} ${r.amount} ${r.currency} ${r.email} sub=${r.subId} (${r.note})`);
  }
  if (skippedNoSubscription.length) {
    console.log(`\nSKIPPED — donor exists but has no subscription to attribute to (needs a manual decision):`);
    for (const r of skippedNoSubscription) console.log(`   ${r.chargeId} ${r.date} ${r.amount} ${r.currency} ${r.email}`);
  }
  console.log(
    `\nNOTE: ${bareCharges.length} unmatched app-era charges have no description/metadata and were NOT touched.` +
    ` They carry the same signature as the pre-2026-04-22 charges from the previous donation platform` +
    ` (no metadata, no payer email). Importing them would fabricate donors and attribution.`
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
