/**
 * Deliberately opt-in read/write integration test for a dedicated Mongo QA DB.
 * No donor, subscription, financial or production collections are accessed.
 *
 * Usage:
 *   DATABASE_URL='mongodb+srv://.../security_qa_example' \
 *   DONATION_SECURITY_QA_ALLOW_WRITE=YES \
 *   node --import tsx scripts/security/verify-mongo-fraud-atomicity.ts
 *
 * Never execute with production DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma";

async function main() {
  const uri = process.env.DATABASE_URL;
  const approved = process.env.DONATION_SECURITY_QA_ALLOW_WRITE === "YES";
  const db = uri ? new URL(uri).pathname.slice(1) : "";
  if (!approved || !/^security_qa_[a-z0-9_-]+$/i.test(db))
    throw new Error("A DEDICATED security_qa_* DATABASE_URL and DONATION_SECURITY_QA_ALLOW_WRITE=YES are mandatory");

  const collection = "DonationSecurityIntegrationQAFixture";
  const id = "qa-" + randomUUID();
  const query = { _id: id };
  try {
    const first = await prisma.$runCommandRaw({
      findAndModify: collection, query: { ...query, revision: { $exists: false } },
      update: { $set: { state: "NORMAL", expiresAt: { $date: new Date(Date.now() + 3_600_000).toISOString() } }, $inc: { revision: 1 } },
      upsert: true, new: true, maxTimeMS: 3_000,
    }) as { ok?: number; value?: { revision?: number } };
    if (first.ok !== 1 || Number(first.value?.revision) !== 1)
      throw new Error("Mongo raw upsert or BSON number decoding failed");

    const attempt = () => prisma.$runCommandRaw({
      findAndModify: collection, query: { ...query, revision: 1 },
      update: { $set: { state: "COOLDOWN" }, $inc: { revision: 1 } },
      new: true, maxTimeMS: 3_000,
    }) as Promise<{ ok?: number; value?: { revision?: number } | null }>;
    const results = await Promise.all([attempt(), attempt()]);
    const winners = results.filter(x => x.ok === 1 && x.value && Number(x.value.revision) === 2);
    if (winners.length !== 1) throw new Error("Expected exactly one winner for same-revision concurrent CAS");

    const read = await prisma.$runCommandRaw({
      find: collection, filter: query, limit: 1, maxTimeMS: 3_000,
    }) as { ok?: number; cursor?: { firstBatch?: { revision?: number; state?: string }[] } };
    const saved = read.cursor?.firstBatch?.[0];
    if (read.ok !== 1 || Number(saved?.revision) !== 2 || saved?.state !== "COOLDOWN")
      throw new Error("Mongo fraud state read-back did not match a single committed writer");

    const index = await prisma.$runCommandRaw({
      createIndexes: collection,
      indexes: [{ key: { expiresAt: 1 }, name: "expiresAt_qa_ttl", expireAfterSeconds: 0 }],
      maxTimeMS: 10_000,
    }) as { ok?: number };
    if (index.ok !== 1) throw new Error("Mongo TTL index creation failed");

    console.log("PASS: isolated Mongo findAndModify, concurrent CAS, read-back, and TTL index");
  } finally {
    await prisma.$runCommandRaw({
      delete: collection, deletes: [{ q: query, limit: 1 }], maxTimeMS: 3_000,
    }).catch(() => {});
    await prisma.$disconnect();
  }
}
main().catch(error => {
  console.error("Mongo QA validation failed:", error instanceof Error ? error.message : "unknown");
  process.exitCode = 1;
});
