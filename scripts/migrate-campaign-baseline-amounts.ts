/**
 * One-time migration: record the offline/legacy portion of every campaign and category total
 * into the new `baselineAmount` field.
 *
 * Until now `currentAmount` mixed two things: money from real donation rows, and money an admin
 * typed into the edit form for donations collected outside the site. Nothing distinguished them,
 * so `recomputeCampaignCurrentAmount` — an absolute overwrite from donation rows, fired on every
 * donation DELETE and PATCH — would silently erase the offline part.
 *
 *   baselineAmount = max(0, currentAmount - settled donation items)
 *
 * `currentAmount` itself is left untouched: the public total does not move. This migration only
 * makes the split explicit so future recomputes preserve it.
 *
 * DRY RUN BY DEFAULT. Pass --commit to write.
 */
import { prisma } from "@/lib/prisma";

const COMMIT = process.argv.includes("--commit");

async function main() {
  const [campaigns, items, donations] = await Promise.all([
    prisma.campaign.findMany({ select: { id: true, title: true, currentAmount: true, baselineAmount: true } }),
    prisma.donationItem.findMany({ select: { campaignId: true, donationId: true, amount: true, amountUSD: true } }),
    prisma.donation.findMany({ select: { id: true, status: true, paidAt: true } }),
  ]);
  const settledDonationIds = new Set(
    donations.filter((d) => d.status === "PAID" && d.paidAt != null).map((d) => d.id)
  );

  const settledByCampaign = new Map<string, number>();
  for (const it of items) {
    if (!settledDonationIds.has(it.donationId)) continue;
    settledByCampaign.set(
      it.campaignId,
      (settledByCampaign.get(it.campaignId) ?? 0) + (it.amountUSD ?? it.amount)
    );
  }

  const changes: { id: string; title: string; current: number; settled: number; baseline: number }[] = [];
  for (const c of campaigns) {
    const settled = Number((settledByCampaign.get(c.id) ?? 0).toFixed(2));
    const current = Number((c.currentAmount ?? 0).toFixed(2));
    const baseline = Number(Math.max(0, current - settled).toFixed(2));
    // $1 threshold: float accumulation over hundreds of items leaves cent-level noise that
    // is not offline money and shouldn't be recorded as such.
    if (baseline >= 1) {
      changes.push({ id: c.id, title: (c.title ?? "").slice(0, 40), current, settled, baseline });
    }
  }

  console.log(`\n=== ${COMMIT ? "COMMIT" : "DRY RUN (pass --commit to apply)"} ===`);
  console.log(`campaigns scanned: ${campaigns.length}`);
  console.log(`campaigns with an offline baseline: ${changes.length}`);
  console.log(`total baseline to protect: $${changes.reduce((s, c) => s + c.baseline, 0).toFixed(2)}\n`);
  for (const c of changes) {
    console.log(`  ${c.title}`);
    console.log(`    currentAmount=${c.current}  settledDonations=${c.settled}  -> baselineAmount=${c.baseline}`);
  }

  if (!COMMIT) return;
  for (const c of changes) {
    // currentAmount is intentionally NOT touched — the public total must not move.
    await prisma.campaign.update({ where: { id: c.id }, data: { baselineAmount: c.baseline } });
  }
  console.log(`\nwrote baselineAmount on ${changes.length} campaign(s).`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
