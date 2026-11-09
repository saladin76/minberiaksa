/**
 * One-time, idempotent database preparation for donation anti-bot counters.
 * Run from the deployment environment before enabling DONATION_ABUSE_GUARD_ENABLED.
 * The TTL index cleans up historical per-IP window counters automatically.
 * No donor/payment records or protection decisions are modified.
 */
import { prisma } from "../../lib/prisma";

async function main() {
  const result = await prisma.$runCommandRaw({
    createIndexes: "DonationPaymentInitiationBudget",
    indexes: [{
      key: { expiresAt: 1 },
      name: "expiresAt_ttl",
      expireAfterSeconds: 0,
    }],
    maxTimeMS: 10000,
  }) as { ok?: number; errmsg?: string };
  if (result.ok !== 1) throw new Error(result.errmsg || "INDEX_CREATE_FAILED");
  console.log("Donation payment initiation TTL index is available.");
}
main().catch((error) => {
  console.error("Donation protection index preparation failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
