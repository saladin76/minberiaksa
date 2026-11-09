/**
 * Audit previously settled one-time card attempts for the operational dashboard.
 * Defaults to READ-ONLY. The explicit --apply switch updates only the optional
 * overviewRecoveredByDonationId presentation marker on matched FAILED records.
 *
 * Usage:
 *   npx tsx scripts/backfill-recovered-donation-overview.ts
 *   npx tsx scripts/backfill-recovered-donation-overview.ts --apply --confirm-view-only-backfill
 *
 * Do NOT run on production without a reviewed snapshot and operator approval.
 * Never updates donation status, paidAt, bank operations, revenue or attribution.
 */
import { prisma } from "../lib/prisma";
import { linkRecoveredFailedAttempts } from "../lib/dashboard/donation-overview-recovery";

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => !["--apply", "--confirm-view-only-backfill"].includes(arg))) {
    throw new Error("UNKNOWN_ARGUMENT");
  }
  if (args.has("--apply") && !args.has("--confirm-view-only-backfill")) {
    throw new Error("VIEW_ONLY_BACKFILL_REQUIRES_EXPLICIT_CONFIRMATION");
  }
  const apply = args.has("--apply") && args.has("--confirm-view-only-backfill");
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const successful = await prisma.donation.findMany({
    where: {
      status: "PAID",
      paidAt: { not: null },
      // MongoDB historical one-time donations may omit subscriptionId entirely.
      OR: [{ subscriptionId: null }, { subscriptionId: { isSet: false } }],
      paymentMethod: "CARD",
      provider: { in: ["ALBARAKA", "PAYFOR"] },
      createdAt: { gte: since },
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  let linked = 0;
  for (const row of successful) {
    const result = await linkRecoveredFailedAttempts(row.id, { dryRun: !apply });
    linked += result.recoveredIds.length;
  }
  console.log(JSON.stringify({
    mode: apply ? "APPLY_VIEW_ONLY" : "DRY_RUN",
    settledInspected: successful.length,
    eligibleFailedAttempts: linked,
    truncatedAt500Settled: successful.length === 500,
    financialRecordsChanged: false,
  }));
}

main().catch((error) => {
  console.error("recovered donation view backfill failed", error instanceof Error ? error.message : "UNKNOWN");
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
