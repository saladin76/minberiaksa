import { PrismaClient } from "../../generated/integration-settings-client";
import { EXPECTED_INTEGRATION_SETTING_INDEXES, INTEGRATION_SETTING_COLLECTION, sameIndexKey, type MongoIndexDescription } from "../../lib/integration-settings/release-readiness";

const prisma = new PrismaClient({ log: [] });

type RawCursor<T> = { cursor?: { firstBatch?: T[] } };
type RawIndex = { name?: string; key?: Record<string, number>; unique?: boolean };
type DuplicateRow = { _id?: { provider?: string; key?: string }; count?: number };

async function collectionExists(): Promise<boolean> {
  const raw = await prisma.$runCommandRaw({ listCollections: 1, filter: { name: INTEGRATION_SETTING_COLLECTION }, nameOnly: true }) as RawCursor<{ name?: string }>;
  return Boolean(raw.cursor?.firstBatch?.some((item) => item.name === INTEGRATION_SETTING_COLLECTION));
}

async function listIndexes(): Promise<MongoIndexDescription[]> {
  if (!(await collectionExists())) return [];
  const raw = await prisma.$runCommandRaw({ listIndexes: INTEGRATION_SETTING_COLLECTION, cursor: {} }) as RawCursor<RawIndex>;
  return (raw.cursor?.firstBatch ?? []).filter((item): item is RawIndex & { name: string; key: Record<string, number> } => Boolean(item.name && item.key)).map((item) => ({ name: item.name, key: item.key, unique: Boolean(item.unique) }));
}

async function assertNoDuplicates(): Promise<void> {
  if (!(await collectionExists())) return;
  const raw = await prisma.$runCommandRaw({ aggregate: INTEGRATION_SETTING_COLLECTION, pipeline: [
    { $group: { _id: { provider: "$provider", key: "$key" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  ], cursor: {} }) as RawCursor<DuplicateRow>;
  if ((raw.cursor?.firstBatch ?? []).length) throw new Error("DUPLICATE_PROVIDER_KEY");
}

async function main() {
  await prisma.$runCommandRaw({ ping: 1 });
  await assertNoDuplicates();
  const actual = await listIndexes();
  const missing: MongoIndexDescription[] = [];
  for (const expected of EXPECTED_INTEGRATION_SETTING_INDEXES) {
    const sameName = actual.find((index) => index.name === expected.name);
    if (sameName) {
      if (!sameIndexKey(sameName.key, expected.key) || Boolean(sameName.unique) !== Boolean(expected.unique)) throw new Error(`INDEX_DEFINITION_CONFLICT:${expected.name}`);
      continue;
    }
    const sameKey = actual.find((index) => sameIndexKey(index.key, expected.key));
    if (sameKey && Boolean(sameKey.unique) !== Boolean(expected.unique)) throw new Error(`INDEX_UNIQUENESS_CONFLICT:${sameKey.name}`);
    missing.push(expected);
  }
  if (!missing.length) {
    console.log("Integration settings migration already applied.");
    return;
  }
  await prisma.$runCommandRaw({
    createIndexes: INTEGRATION_SETTING_COLLECTION,
    indexes: missing.map((index) => ({ key: index.key, name: index.name, ...(index.unique ? { unique: true } : {}) })),
  });
  console.log(`Integration settings migration applied missing indexes: ${missing.length}.`);
}

main()
  .catch((error) => {
    const safeCode = error instanceof Error ? error.message.split(":")[0] : "UNKNOWN_MIGRATION_ERROR";
    console.error(`Integration settings migration failed: ${safeCode}.`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
