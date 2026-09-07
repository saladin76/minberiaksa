/**
 * Manual runner for the same reconciliation the daily cron performs.
 *
 * Dry run by default — pass --apply to write.
 *
 *   npx tsx scripts/reconcile-unconfirmed-donations.ts
 *   npx tsx scripts/reconcile-unconfirmed-donations.ts --apply
 *   npx tsx scripts/reconcile-unconfirmed-donations.ts --apply --stale-hours=48
 *
 * The logic lives in lib/donations/reconcile-unconfirmed.ts so this and the cron route can never
 * drift into disagreeing about what counts as paid.
 */
import { prisma } from "@/lib/prisma";
import { reconcileUnconfirmedDonations } from "@/lib/donations/reconcile-unconfirmed";

const APPLY = process.argv.includes("--apply");
const staleArg = process.argv.find((a) => a.startsWith("--stale-hours="));
const staleAfterHours = staleArg ? Number(staleArg.split("=")[1]) : 48;

async function main() {
  const summary = await reconcileUnconfirmedDonations({ dryRun: !APPLY, staleAfterHours });

  console.log(`${summary.dryRun ? "DRY RUN" : "APPLIED"} — scanned ${summary.scanned} unconfirmed donation(s)\n`);

  console.log(`credited (paid at Stripe, webhook never arrived): ${summary.credited.length}`);
  for (const c of summary.credited) {
    console.log(`   ${c.donationId}  $${c.amountUSD.toFixed(2)}  paidAt=${c.paidAt.slice(0, 16)}`);
  }
  console.log(`   total recovered: $${summary.creditedTotalUSD.toFixed(2)}\n`);

  console.log(`marked FAILED (abandoned, older than ${staleAfterHours}h): ${summary.markedFailed.length}`);
  const failedUsd = summary.markedFailed.reduce((s, f) => s + f.amountUSD, 0);
  console.log(`   attempted value (never collected): $${failedUsd.toFixed(2)}\n`);

  console.log(`left alone (too new, or still open at Stripe): ${summary.leftAlone}`);

  if (summary.errors.length) {
    console.log(`\nerrors: ${summary.errors.length}`);
    for (const e of summary.errors.slice(0, 10)) console.log(`   ${e.donationId}: ${e.error}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
