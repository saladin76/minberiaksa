import { PrismaClient } from "@prisma/client";
import {
  getDonorCountryCodeForSnapshot,
  normalizeDonorCountryCode,
} from "../lib/donations/donor-country-code";

const prisma = new PrismaClient();

const BATCH = 300;

async function main() {
  let skip = 0;
  let scanned = 0;
  let needsBackfill = 0;
  let updated = 0;

  for (;;) {
    const rows = await prisma.donation.findMany({
      skip,
      take: BATCH,
      orderBy: { id: "asc" },
      select: { id: true, donorId: true, donorCountryCode: true },
    });
    if (rows.length === 0) break;

    scanned += rows.length;

    for (const r of rows) {
      // MongoDB often omits new fields entirely; Prisma reads them as null. A DB-only
      // `where: { donorCountryCode: null }` can miss “missing field” documents.
      if (normalizeDonorCountryCode(r.donorCountryCode)) continue;
      needsBackfill++;

      const code = await getDonorCountryCodeForSnapshot(prisma, r.donorId);
      if (code) {
        await prisma.donation.update({
          where: { id: r.id },
          data: { donorCountryCode: code },
        });
        updated++;
      }
    }

    skip += BATCH;
  }

  console.log(
    `Processed ${scanned} donation(s); ${needsBackfill} lacked a valid country code; updated ${updated}.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
