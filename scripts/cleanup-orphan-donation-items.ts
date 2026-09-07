// Find (and optionally delete) DonationItem / DonationCategoryItem rows whose parent
// Donation no longer exists. MongoDB doesn't enforce FK integrity, so orphans can appear
// after manual deletes or interrupted cascades — and any query that includes the required
// `donation` relation will throw `PrismaClientUnknownRequestError`.
//
// Usage:
//   tsx scripts/cleanup-orphan-donation-items.ts           # dry-run, prints orphans
//   tsx scripts/cleanup-orphan-donation-items.ts --apply   # actually delete

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BATCH = 500;
const APPLY = process.argv.includes("--apply");

async function scan<T extends { id: string; donationId: string }>(
  label: string,
  fetch: (skip: number) => Promise<T[]>,
  remove: (ids: string[]) => Promise<{ count: number }>
) {
  let skip = 0;
  let scanned = 0;
  const orphanIds: string[] = [];

  for (;;) {
    const rows = await fetch(skip);
    if (rows.length === 0) break;
    scanned += rows.length;

    const donationIds = Array.from(new Set(rows.map((r) => r.donationId)));
    const existing = await prisma.donation.findMany({
      where: { id: { in: donationIds } },
      select: { id: true },
    });
    const existingSet = new Set(existing.map((d) => d.id));

    for (const r of rows) {
      if (!existingSet.has(r.donationId)) orphanIds.push(r.id);
    }

    skip += rows.length;
  }

  console.log(`[${label}] scanned=${scanned} orphans=${orphanIds.length}`);
  if (orphanIds.length > 0) {
    console.log(`[${label}] orphan ids:`, orphanIds.slice(0, 20), orphanIds.length > 20 ? `(+${orphanIds.length - 20} more)` : "");
  }

  if (APPLY && orphanIds.length > 0) {
    const res = await remove(orphanIds);
    console.log(`[${label}] deleted=${res.count}`);
  }
}

async function main() {
  console.log(APPLY ? "MODE: APPLY (deletions will be performed)" : "MODE: DRY-RUN (use --apply to delete)");

  await scan(
    "DonationItem",
    (skip) =>
      prisma.donationItem.findMany({
        skip,
        take: BATCH,
        orderBy: { id: "asc" },
        select: { id: true, donationId: true },
      }),
    (ids) => prisma.donationItem.deleteMany({ where: { id: { in: ids } } })
  );

  await scan(
    "DonationCategoryItem",
    (skip) =>
      prisma.donationCategoryItem.findMany({
        skip,
        take: BATCH,
        orderBy: { id: "asc" },
        select: { id: true, donationId: true },
      }),
    (ids) => prisma.donationCategoryItem.deleteMany({ where: { id: { in: ids } } })
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
