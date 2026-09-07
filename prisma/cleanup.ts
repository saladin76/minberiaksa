// prisma/cleanup.ts
//
// One-shot maintenance:
//   1. Delete the "سوريا" category and every campaign inside it (plus the
//      related child rows on those campaigns).
//   2. Set isActive=false on every campaign in the "غزه" category.
//
// Safe to run repeatedly — every step queries by name and no-ops when there's
// nothing to do.
//
// Run with:  npx tsx prisma/cleanup.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TARGET_DELETE = "سوريا";
const TARGET_DEACTIVATE = "غزه";

async function main() {
  console.log("🧹 Cleanup starting…");

  // ─────────────────────────────────────────────
  // 1. Delete "سوريا" + all its campaigns
  // ─────────────────────────────────────────────
  const syria = await prisma.category.findUnique({
    where: { name: TARGET_DELETE },
    select: { id: true, name: true },
  });

  if (!syria) {
    console.log(`ℹ️  Category "${TARGET_DELETE}" not found — nothing to delete`);
  } else {
    const campaignsToDelete = await prisma.campaign.findMany({
      where: { categoryIds: { has: syria.id } },
      select: { id: true, title: true },
    });
    const campaignIds = campaignsToDelete.map((c) => c.id);

    if (campaignIds.length > 0) {
      // Walk down the foreign-key tree from the deepest children up. For
      // dummy/seeded campaigns most of these tables are empty, so each call
      // typically deletes 0 rows — but being explicit keeps us safe if real
      // data was attached through the dashboard before cleanup.

      // Updates have their own translations
      const updatesUnderCampaigns = await prisma.update.findMany({
        where: { campaignId: { in: campaignIds } },
        select: { id: true },
      });
      const updateIds = updatesUnderCampaigns.map((u) => u.id);
      if (updateIds.length > 0) {
        await prisma.updateTranslation.deleteMany({
          where: { updateId: { in: updateIds } },
        });
      }
      await prisma.update.deleteMany({
        where: { campaignId: { in: campaignIds } },
      });

      // Direct children of Campaign
      await prisma.donationItem.deleteMany({
        where: { campaignId: { in: campaignIds } },
      });
      await prisma.subscriptionItem.deleteMany({
        where: { campaignId: { in: campaignIds } },
      });
      await prisma.cartItem.deleteMany({
        where: { campaignId: { in: campaignIds } },
      });
      await prisma.comment.deleteMany({
        where: { campaignId: { in: campaignIds } },
      });
      // CampaignTranslation has onDelete: Cascade — auto-removed below.

      await prisma.campaign.deleteMany({
        where: { id: { in: campaignIds } },
      });
    }

    // CategoryTranslation has onDelete: Cascade — auto-removed when the
    // parent category goes away.
    await prisma.category.delete({ where: { id: syria.id } });

    console.log(
      `✓ Deleted "${TARGET_DELETE}" category and ${campaignIds.length} campaign(s)`
    );
  }

  // ─────────────────────────────────────────────
  // 2. Deactivate every campaign in "غزه"
  // ─────────────────────────────────────────────
  const gaza = await prisma.category.findUnique({
    where: { name: TARGET_DEACTIVATE },
    select: { id: true, name: true },
  });

  if (!gaza) {
    console.log(
      `ℹ️  Category "${TARGET_DEACTIVATE}" not found — nothing to deactivate`
    );
  } else {
    const result = await prisma.campaign.updateMany({
      where: { categoryIds: { has: gaza.id }, isActive: true },
      data: { isActive: false },
    });
    const stillActive = await prisma.campaign.count({
      where: { categoryIds: { has: gaza.id }, isActive: true },
    });
    console.log(
      `✓ Deactivated ${result.count} campaign(s) in "${TARGET_DEACTIVATE}" (now: ${stillActive} active)`
    );
  }

  console.log("✅ Cleanup complete");
}

main()
  .catch((e) => {
    console.error("❌ Cleanup failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
