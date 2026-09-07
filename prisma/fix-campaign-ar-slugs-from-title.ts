// Regenerates every Campaign.slug (Arabic / default locale URL) from the main Arabic `title`.
// There is no CampaignTranslation row for `ar`; this field is what /ar/campaign/[slug] uses.
//
// WARNING: Existing slugs that were hand-tuned or differ from the title will be replaced.
// External links to old slugs may break unless you redirect.
//
// Run:  npx tsx prisma/fix-campaign-ar-slugs-from-title.ts
//
// Dry run (log only, no DB writes):  npx tsx prisma/fix-campaign-ar-slugs-from-title.ts --dry-run

import { PrismaClient } from "@prisma/client";
import { generateUniqueSlug } from "../lib/slug";

const prisma = new PrismaClient();

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const rows = await prisma.campaign.findMany({
    select: { id: true, title: true, slug: true },
    orderBy: { createdAt: "asc" },
  });

  let updated = 0;
  let skipped = 0;
  let unchanged = 0;

  for (const row of rows) {
    const base = row.title?.trim() ?? "";
    if (!base) {
      console.warn(`[skip] ${row.id}: empty Arabic title, keeping slug=${row.slug ?? "(none)"}`);
      skipped += 1;
      continue;
    }

    const nextSlug = await generateUniqueSlug(prisma.campaign as any, base, {
      fallbackPrefix: "campaign",
      currentId: row.id,
    });

    if (nextSlug === (row.slug ?? null)) {
      unchanged += 1;
      continue;
    }

    if (dryRun) {
      const preview = base.length > 60 ? `${base.slice(0, 60)}…` : base;
      console.log(`[dry-run] ${row.id}: "${row.slug}" -> "${nextSlug}" (title: ${preview})`);
    } else {
      await prisma.campaign.update({
        where: { id: row.id },
        data: { slug: nextSlug },
      });
    }
    updated += 1;
  }

  console.log(
    dryRun
      ? `[dry-run] would update ${updated}, unchanged ${unchanged}, skipped ${skipped} (total ${rows.length})`
      : `[done] updated ${updated}, unchanged ${unchanged}, skipped ${skipped} (total ${rows.length})`
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
