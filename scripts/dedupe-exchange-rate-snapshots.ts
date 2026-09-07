/**
 * Collapse duplicate `ExchangeRateSnapshot` rows to one per `key`, keeping the
 * newest `fetchedAt`.
 *
 * Why duplicates exist at all: `rates-service.ts` already writes with
 * `upsert({ where: { key } })` and reads with `findUnique({ where: { key } })`.
 * On MongoDB a Prisma `@unique` is only enforced once the index actually exists
 * on the database — and `ExchangeRateSnapshot_key_key` had never been created —
 * so every refresh inserted a new row instead of updating the existing one.
 *
 * That is not only a `db push` blocker. With several matching documents,
 * `findUnique` returns whichever the server yields first, which is not
 * necessarily the newest, so currency conversion could silently run on a months
 * old snapshot. Creating the index after this cleanup makes the upsert correct
 * permanently.
 *
 * Run:  tsx scripts/dedupe-exchange-rate-snapshots.ts [--apply]
 * Without `--apply` it only reports.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: [] });
const APPLY = process.argv.includes("--apply");

async function main() {
  const rows = await prisma.exchangeRateSnapshot.findMany({
    select: { id: true, key: true, baseCode: true, fetchedAt: true },
  });

  const byKey = new Map<string, typeof rows>();
  for (const row of rows) byKey.set(row.key, [...(byKey.get(row.key) ?? []), row]);

  const doomed: { id: string; key: string; fetchedAt: Date }[] = [];
  for (const [key, group] of byKey) {
    if (group.length < 2) continue;
    const [keep, ...rest] = [...group].sort((a, b) => b.fetchedAt.getTime() - a.fetchedAt.getTime());
    console.log(`${key}: ${group.length} rows — keeping ${keep.id} (${keep.fetchedAt.toISOString()})`);
    for (const row of rest) {
      console.log(`  ${APPLY ? "deleting" : "would delete"} ${row.id} (${row.fetchedAt.toISOString()})`);
      doomed.push(row);
    }
  }

  if (doomed.length === 0) {
    console.log("Nothing to do — one snapshot per key already.");
  } else if (APPLY) {
    const res = await prisma.exchangeRateSnapshot.deleteMany({ where: { id: { in: doomed.map((d) => d.id) } } });
    console.log(`\nDeleted ${res.count} stale snapshot(s).`);
  } else {
    console.log(`\n${doomed.length} stale snapshot(s) would be deleted. Re-run with --apply.`);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("dedupe-exchange-rate-snapshots failed:", error);
  process.exit(1);
});
