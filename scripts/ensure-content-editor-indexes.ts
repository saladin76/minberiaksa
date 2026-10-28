import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";

loadEnvConfig(process.cwd(), process.env.NODE_ENV === "development");

const indexes = [
  {
    collection: "CampaignSlugRedirect",
    key: { locale: 1, slug: 1 },
    unique: true,
  },
  { collection: "CampaignSlugRedirect", key: { campaignId: 1 }, unique: false },
  { collection: "Category", key: { previousSlugs: 1 }, unique: false },
  { collection: "SuperCategory", key: { slug: 1 }, unique: true },
  {
    collection: "SuperCategoryTranslation",
    key: { superCategoryId: 1, locale: 1 },
    unique: true,
  },
  {
    collection: "SuperCategoryBlock",
    key: { superCategoryId: 1, order: 1 },
    unique: false,
  },
  {
    collection: "SuperCategoryBlockTranslation",
    key: { blockId: 1, locale: 1 },
    unique: true,
  },
  {
    collection: "SuperCategoryItem",
    key: { superCategoryId: 1, kind: 1, refId: 1 },
    unique: true,
  },
  { collection: "UrgentBanner", key: { slug: 1 }, unique: true },
  {
    collection: "UrgentBanner",
    key: { isActive: 1, priority: 1 },
    unique: false,
  },
  {
    collection: "UrgentBannerTranslation",
    key: { urgentBannerId: 1, locale: 1 },
    unique: true,
  },
  { collection: "Campaign", key: { previousSlugs: 1 }, unique: false },
  { collection: "Post", key: { previousSlugs: 1 }, unique: false },
  { collection: "EditorialJob", key: { key: 1 }, unique: true },
  { collection: "EditorialJob", key: { status: 1, priority: 1, createdAt: 1 }, unique: false },
  { collection: "EditorialJob", key: { sourceId: 1, locale: 1 }, unique: false },
  { collection: "SuperCategory", key: { previousSlugs: 1 }, unique: false },
  // Additive lookup indexes for date/project audiences. Never remove existing indexes.
  { collection: "Donation", key: { donorId: 1, status: 1, paidAt: 1 }, unique: false },
  { collection: "Donation", key: { status: 1, paidAt: 1, donorId: 1 }, unique: false },
  { collection: "DonationItem", key: { donationId: 1, campaignId: 1 }, unique: false },
  { collection: "DonationItem", key: { campaignId: 1, donationId: 1 }, unique: false },
  { collection: "Subscription", key: { donorId: 1, status: 1 }, unique: false },
  { collection: "Video", key: { campaignIds: 1 }, unique: false },
  { collection: "Video", key: { sourceUpdateId: 1 }, unique: false },
  { collection: "GoogleSearchPlan", key: { connectionId: 1, createdAt: 1 }, unique: false },
  { collection: "GoogleSearchPlan", key: { automationEnabled: 1, lastReviewAt: 1 }, unique: false },
  { collection: "AuditLog", key: { action: 1, entityType: 1, createdAt: -1 }, unique: false },
  { collection: "Donation", key: { "attribution.utm_medium": 1, status: 1, _id: 1 }, unique: false },

];

async function run() {
  const checkOnly = process.argv.includes("--check");
  const production = process.argv.includes("--production");

  // --production is also used by VPS releases, which have no Vercel variables.
  // Only a known non-production Vercel deployment should skip this step.
  if (production && process.env.VERCEL && process.env.VERCEL_ENV !== "production") {
    console.log("Content editor indexes: production-only step skipped");
    return;
  }
  if (!process.argv.includes("--apply") && !production && !checkOnly) {
    console.log(JSON.stringify({ dryRun: true, indexes }, null, 2));
    return;
  }

  const prisma = new PrismaClient();
  let missing = 0;
  try {
    for (const spec of indexes) {
      const collection = await prisma.$runCommandRaw({
        listCollections: 1,
        filter: { name: spec.collection },
        nameOnly: true,
      });
      const found = (collection.cursor as { firstBatch?: unknown[] })
        ?.firstBatch?.length;
      const result = found
        ? await prisma.$runCommandRaw({ listIndexes: spec.collection })
        : null;
      const existing = result
        ? (
            result.cursor as {
              firstBatch?: Array<{ key?: unknown; unique?: boolean }>;
            }
          )?.firstBatch || []
        : [];
      const matching = existing.find(
        (index) => JSON.stringify(index.key) === JSON.stringify(spec.key),
      );

      if (matching) {
        if (spec.unique && !matching.unique) {
          const message = `Non-unique index already exists for ${spec.collection}; inspect it before creating a unique index`;
          if (checkOnly) {
            console.error(message);
            missing += 1;
            continue;
          }
          throw new Error(message);
        }
        console.log(`${spec.collection}: index exists`);
        continue;
      }

      if (checkOnly) {
        console.error(`${spec.collection}: expected index is missing`);
        missing += 1;
        continue;
      }

      await prisma.$runCommandRaw({
        createIndexes: spec.collection,
        indexes: [
          {
            key: spec.key,
            name: "content_editor_" + Object.keys(spec.key).join("_"),
            ...(spec.unique ? { unique: true } : {}),
          },
        ],
      });
      console.log(`${spec.collection}: index created`);
    }

    if (checkOnly && missing > 0) {
      console.error(`Content editor indexes: ${missing} issue(s) need review`);
      process.exitCode = 1;
    } else if (checkOnly) {
      console.log("Content editor indexes: all expected indexes are present");
    }
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : "Index setup failed");
  process.exitCode = 1;
});
