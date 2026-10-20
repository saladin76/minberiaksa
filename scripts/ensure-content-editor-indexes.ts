import { PrismaClient } from "@prisma/client";
const indexes = [
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
];
async function run() {
 if (process.argv.includes("--production") && process.env.VERCEL_ENV !== "production") { console.log("Content editor indexes: production-only step skipped"); return; }
  if (!process.argv.includes("--apply") && !process.argv.includes("--production")) {
    console.log(JSON.stringify({ dryRun: true, indexes }, null, 2));
    return;
  }
  const prisma = new PrismaClient();
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
        if (spec.unique && !matching.unique)
          throw new Error(
            `Non-unique index already exists for ${spec.collection}; inspect it before creating a unique index`,
          );
        console.log(`${spec.collection}: index exists`);
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
  } finally {
    await prisma.$disconnect();
  }
}
run().catch((error) => {
  console.error(error instanceof Error ? error.message : "Index setup failed");
  process.exitCode = 1;
});
