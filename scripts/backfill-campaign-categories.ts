/**
 * Backfill the Campaign ↔ Category many-to-many relation.
 *
 * Pre-migration state: each Campaign document carries a single `categoryId`
 * (legacy 1-to-many). Post-migration the relation lives on mirrored
 * ObjectId[] arrays — `Campaign.categoryIds` and `Category.campaignIds` —
 * managed by Prisma's implicit m2m.
 *
 * What this script does (idempotent — safe to re-run):
 *   1. For each Campaign whose `categoryIds` is empty/missing, read the
 *      legacy `categoryId` directly from MongoDB and seed `categoryIds`
 *      with [categoryId].
 *   2. Migrate the old single `categoryPriority` (Int) into
 *      `categoryPriorities` (JSON `{ [categoryId]: number }`) keyed by the
 *      legacy categoryId so the per-category ordering survives.
 *   3. Rebuild every Category's mirror array (`campaignIds`) from the
 *      campaigns that now reference it. This is the side Prisma maintains
 *      automatically going forward — we only set it here for legacy rows.
 *
 * Run with:  npx tsx scripts/backfill-campaign-categories.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔁 Backfilling Campaign ↔ Category m2m…");

  // Reach into the underlying MongoDB driver so we can read the legacy
  // `categoryId` / `categoryPriority` fields that Prisma no longer exposes on
  // the typed client.
  const db = (prisma as unknown as {
    $runCommandRaw: (cmd: Record<string, unknown>) => Promise<any>;
  }).$runCommandRaw;

  // 1. Pull every Campaign with the raw legacy fields.
  const findRes = await db.bind(prisma)({
    find: "Campaign",
    filter: {},
    projection: { _id: 1, categoryId: 1, categoryIds: 1, categoryPriority: 1, categoryPriorities: 1 },
  });
  const rawCampaigns = (findRes?.cursor?.firstBatch ?? []) as Array<{
    _id: { $oid: string } | string;
    categoryId?: { $oid: string } | string | null;
    categoryIds?: Array<{ $oid: string } | string> | null;
    categoryPriority?: number | null;
    categoryPriorities?: Record<string, number> | null;
  }>;

  const oid = (v: unknown): string | null => {
    if (!v) return null;
    if (typeof v === "string") return v;
    if (typeof v === "object" && v && "$oid" in (v as any)) return String((v as any).$oid);
    return null;
  };

  let campaignsBackfilled = 0;
  let prioritiesMigrated = 0;
  const campaignsByCategory = new Map<string, Set<string>>();

  for (const c of rawCampaigns) {
    const campaignId = oid(c._id);
    if (!campaignId) continue;

    const existingIds = new Set<string>();
    if (Array.isArray(c.categoryIds)) {
      for (const cid of c.categoryIds) {
        const s = oid(cid);
        if (s) existingIds.add(s);
      }
    }
    const legacyId = oid(c.categoryId);
    const needsCategoryIdsSeed = existingIds.size === 0 && legacyId != null;
    if (needsCategoryIdsSeed) existingIds.add(legacyId!);

    // Track category → campaigns for the mirror rebuild later.
    for (const cid of existingIds) {
      if (!campaignsByCategory.has(cid)) campaignsByCategory.set(cid, new Set());
      campaignsByCategory.get(cid)!.add(campaignId);
    }

    // Build the categoryPriorities map: keep anything already there, and
    // fold in the legacy single value (keyed by the legacy categoryId).
    const prio: Record<string, number> = {};
    if (c.categoryPriorities && typeof c.categoryPriorities === "object") {
      for (const [k, v] of Object.entries(c.categoryPriorities)) {
        const n = Number(v);
        if (Number.isFinite(n)) prio[k] = n;
      }
    }
    let prioritiesChanged = false;
    if (typeof c.categoryPriority === "number" && legacyId && !(legacyId in prio)) {
      prio[legacyId] = c.categoryPriority;
      prioritiesChanged = true;
    }

    const $set: Record<string, unknown> = {};
    const $unset: Record<string, unknown> = {};
    if (needsCategoryIdsSeed) {
      $set.categoryIds = Array.from(existingIds).map((id) => ({ $oid: id }));
      campaignsBackfilled += 1;
    }
    if (prioritiesChanged) {
      $set.categoryPriorities = prio;
      prioritiesMigrated += 1;
    }
    // Sweep the deprecated fields once we've copied their values forward.
    if (legacyId) $unset.categoryId = "";
    if (typeof c.categoryPriority === "number") $unset.categoryPriority = "";

    const update: Record<string, unknown> = {};
    if (Object.keys($set).length) update.$set = $set;
    if (Object.keys($unset).length) update.$unset = $unset;
    if (!Object.keys(update).length) continue;

    await db.bind(prisma)({
      update: "Campaign",
      updates: [
        {
          q: { _id: { $oid: campaignId } },
          u: update,
        },
      ],
    });
  }

  console.log(`   ✓ Campaigns: seeded categoryIds on ${campaignsBackfilled}, migrated categoryPriority on ${prioritiesMigrated}`);

  // 2. Rebuild Category.campaignIds mirror from the campaigns we just walked.
  const categoryListRes = await db.bind(prisma)({
    find: "Category",
    filter: {},
    projection: { _id: 1, campaignIds: 1 },
  });
  const allCategories = (categoryListRes?.cursor?.firstBatch ?? []) as Array<{
    _id: { $oid: string } | string;
    campaignIds?: Array<{ $oid: string } | string> | null;
  }>;

  let categoriesUpdated = 0;
  for (const cat of allCategories) {
    const catId = oid(cat._id);
    if (!catId) continue;

    const wanted = Array.from(campaignsByCategory.get(catId) ?? []);
    const existing = new Set<string>();
    if (Array.isArray(cat.campaignIds)) {
      for (const cid of cat.campaignIds) {
        const s = oid(cid);
        if (s) existing.add(s);
      }
    }

    // Merge — we never want to drop a campaign reference that Prisma already
    // wrote (e.g. via the dashboard after the schema landed but before the
    // backfill ran).
    const merged = new Set<string>([...existing, ...wanted]);
    if (merged.size === existing.size && wanted.every((id) => existing.has(id))) {
      continue;
    }

    await db.bind(prisma)({
      update: "Category",
      updates: [
        {
          q: { _id: { $oid: catId } },
          u: {
            $set: {
              campaignIds: Array.from(merged).map((id) => ({ $oid: id })),
            },
          },
        },
      ],
    });
    categoriesUpdated += 1;
  }

  console.log(`   ✓ Categories: refreshed campaignIds mirror on ${categoriesUpdated}`);
  console.log("✅ Backfill complete");
}

main()
  .catch((err) => {
    console.error("❌ Backfill failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
