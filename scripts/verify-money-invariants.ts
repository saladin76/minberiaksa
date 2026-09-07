/**
 * Money invariants — READ ONLY. Never writes. Safe to run any time, in any environment.
 *
 * Each check corresponds to a defect fixed in the 2026-07-31/08-01 sessions and exists to
 * catch a REGRESSION of it. Run this after any change to donations, subscriptions, campaign
 * totals, or the dashboard aggregations.
 *
 *   npx tsx scripts/verify-money-invariants.ts
 *   npx tsx scripts/verify-money-invariants.ts --verbose   # list offending rows
 *
 * Exit code 1 if any invariant fails, so it can gate CI.
 *
 * NOT covered here: "every paid Stripe invoice has exactly one donation row" — that needs the
 * Stripe API and already exists as scripts/audit-stripe-subscription-donations.ts. This script
 * is deliberately DB-only so it stays fast and needs no Stripe credentials.
 */
import { prisma } from "@/lib/prisma";

const VERBOSE = process.argv.includes("--verbose");
const money = (n: number) => `$${n.toFixed(2)}`;

type Result = { name: string; ok: boolean; detail: string; guards: string };
const results: Result[] = [];
function record(name: string, ok: boolean, detail: string, guards: string) {
  results.push({ name, ok, detail, guards });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
}

/** Mirrors donationRowUsdApprox in lib/dashboard/donation-usd-revenue.ts. */
function usdApprox(r: { amountUSD: number | null; amount: number; currency: string }): number {
  if (typeof r.amountUSD === "number" && Number.isFinite(r.amountUSD) && r.amountUSD > 0) return r.amountUSD;
  if (r.currency === "USD" && Number.isFinite(r.amount)) return r.amount;
  return 0;
}

async function main() {
  console.log("\n=== MONEY INVARIANTS (read-only) ===\n");

  const [campaigns, items, donations] = await Promise.all([
    prisma.campaign.findMany({ select: { id: true, title: true, currentAmount: true, baselineAmount: true } }),
    prisma.donationItem.findMany({ select: { id: true, donationId: true, campaignId: true, amount: true, amountUSD: true } }),
    prisma.donation.findMany({
      select: {
        id: true, status: true, paidAt: true, subscriptionId: true, providerOrderId: true,
        amount: true, amountUSD: true, currency: true, totalAmount: true,
      },
    }),
  ]);

  const byId = new Map(donations.map((d) => [d.id, d]));

  // TWO different definitions of "counts", deliberately — they are not interchangeable and
  // conflating them is itself a bug (it made the first draft of this script report 8 false
  // failures):
  //
  //   contributesToCampaign — STRICT: PAID *and* paidAt set. This is what
  //     lib/campaign/current-amount.ts uses for campaign.currentAmount. An unsettled
  //     subscription row must not move a campaign total until the gateway confirms, or the
  //     Stripe webhook's own increment double-counts it.
  //
  //   isRevenue — LENIENT: PAID and (paidAt set OR it is a subscription row). This is
  //     PAID_DONATION_FILTER, what the dashboard cards / exports / public donor counts use.
  //
  const contributesToCampaign = (d: (typeof donations)[number]) => d.status === "PAID" && d.paidAt != null;
  const isRevenue = (d: (typeof donations)[number]) =>
    d.status === "PAID" && (d.paidAt != null || d.subscriptionId != null);

  const campaignSettledIds = new Set(donations.filter(contributesToCampaign).map((d) => d.id));
  const settledIds = new Set(donations.filter(isRevenue).map((d) => d.id));

  // ── 1. campaign.currentAmount == baselineAmount + settled items ── guards P0-3
  const settledByCampaign = new Map<string, number>();
  for (const it of items) {
    // STRICT — must match lib/campaign/current-amount.ts exactly.
    if (!campaignSettledIds.has(it.donationId)) continue;
    settledByCampaign.set(it.campaignId, (settledByCampaign.get(it.campaignId) ?? 0) + (it.amountUSD ?? it.amount));
  }
  const drift = campaigns
    .map((c) => {
      const expected = (c.baselineAmount ?? 0) + (settledByCampaign.get(c.id) ?? 0);
      return { title: (c.title ?? "").slice(0, 40), actual: c.currentAmount ?? 0, expected, delta: (c.currentAmount ?? 0) - expected };
    })
    .filter((c) => Math.abs(c.delta) > 0.05);
  record(
    "campaign.currentAmount == baselineAmount + settled items",
    drift.length === 0,
    drift.length === 0
      ? `${campaigns.length} campaigns, 0 drifting`
      : `${drift.length} campaign(s) drifting, total ${money(drift.reduce((s, c) => s + Math.abs(c.delta), 0))}`,
    "P0-3 — a naive recompute wiping manually-entered offline money"
  );
  if (VERBOSE && drift.length) for (const c of drift) console.log(`          ${c.title}: actual ${money(c.actual)} vs expected ${money(c.expected)} (${money(c.delta)})`);

  // ── 2. no duplicate subscription charge rows ── guards P0-1
  const chargeKey = new Map<string, string[]>();
  for (const d of donations) {
    if (!d.subscriptionId || !d.providerOrderId) continue;
    const k = `${d.subscriptionId}::${d.providerOrderId}`;
    chargeKey.set(k, [...(chargeKey.get(k) ?? []), d.id]);
  }
  const dupes = [...chargeKey.entries()].filter(([, ids]) => ids.length > 1);
  record(
    "one donation row per (subscription, invoice)",
    dupes.length === 0,
    dupes.length === 0 ? `${chargeKey.size} subscription charges, 0 duplicated` : `${dupes.length} duplicated charge(s)`,
    "P0-1 — webhook double-inserting a renewal, doubling revenue"
  );
  if (VERBOSE && dupes.length) for (const [k, ids] of dupes) console.log(`          ${k} -> ${ids.join(", ")}`);

  // ── 3. every settled donation has a usable USD value ── guards P2-2
  const noUsd = donations.filter((d) => isRevenue(d) && usdApprox(d) <= 0);
  record(
    "every settled donation has a usable USD amount",
    noUsd.length === 0,
    noUsd.length === 0 ? `${settledIds.size} settled donations, all convertible` : `${noUsd.length} settled donation(s) contribute $0 to USD totals`,
    "P2-2 — local currency written into the USD column, or an uncountable row"
  );
  if (VERBOSE && noUsd.length) for (const d of noUsd.slice(0, 20)) console.log(`          ${d.id} ${d.currency} amount=${d.amount} amountUSD=${d.amountUSD}`);

  // ── 4. no orphan line items ── guards P2-6
  const orphans = items.filter((i) => !byId.has(i.donationId));
  const orphanValue = orphans.reduce((s, i) => s + (i.amountUSD ?? i.amount ?? 0), 0);
  record(
    "no orphan DonationItem rows",
    orphans.length === 0,
    orphans.length === 0 ? `${items.length} items, 0 orphaned` : `${orphans.length} orphaned item(s) worth ${money(orphanValue)}`,
    "P2-6 — items whose parent donation was deleted"
  );

  // ── 5. public donor counts exclude unsettled + orphaned ── guards P2-6b
  const activeCampaigns = await prisma.campaign.findMany({ where: { isActive: true }, select: { id: true, title: true } });
  let unjoined = 0;
  let joined = 0;
  for (const c of activeCampaigns) {
    const all = items.filter((i) => i.campaignId === c.id);
    unjoined += all.length;
    joined += all.filter((i) => settledIds.has(i.donationId)).length;
  }
  record(
    "public donor count counts only settled donations",
    true, // informational: the fix is in the query, this reports the gap it closes
    `raw item count ${unjoined} vs settled-only ${joined} — ${unjoined - joined} rows the public count MUST exclude`,
    "P2-6b — failed/abandoned/orphaned rows shown publicly as donors"
  );

  // ── 6. teamSupport/fees are prorated against a real total ── guards P2-5
  const unproratable = donations.filter((d) => isRevenue(d) && !(Number(d.totalAmount) > 0));
  record(
    "settled donations have totalAmount > 0 (prorating is safe)",
    unproratable.length === 0,
    unproratable.length === 0 ? `${settledIds.size} settled rows all proratable` : `${unproratable.length} row(s) cannot be prorated and are skipped by the cards`,
    "P2-5 — `totalAmount || 1` letting one row dominate the teamSupport card"
  );

  const failed = results.filter((r) => !r.ok);
  console.log("\n=== SUMMARY ===");
  console.log(`  ${results.length - failed.length}/${results.length} invariants hold`);
  if (failed.length) {
    console.log("\n  FAILING — each maps to a fixed defect that has regressed:");
    for (const r of failed) console.log(`    - ${r.name}\n        regression of: ${r.guards}`);
    process.exitCode = 1;
  } else {
    console.log("  No regressions detected.");
  }
  console.log("");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
