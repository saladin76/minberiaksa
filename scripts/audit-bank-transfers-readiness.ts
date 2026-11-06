import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: [] });

// Read-only: no bank-provider requests, writes, donor rows or credentials.
async function main() {
  const checks: Array<{ stage: string; ok: boolean; code?: string }> = [];
  async function check(stage: string, run: () => Promise<unknown>) {
    try { await run(); checks.push({ stage, ok: true }); }
    catch (error) {
      const record = error && typeof error === "object" ? error as { code?: unknown; meta?: { code?: unknown } } : {};
      const code = String(record.meta?.code ?? record.code ?? "READ_FAILED");
      checks.push({ stage, ok: false, code: /^[a-zA-Z0-9_-]{1,40}$/.test(code) ? code : "READ_FAILED" });
    }
  }
  const sample = [{ $match: {} }, { $limit: 1 }, { $project: { _id: 1 } }];
  await check("current_bank_catalogue", () => prisma.bankTransferBankRecord.aggregateRaw({ pipeline: sample, options: { maxTimeMS: 15000 } }));
  await check("legacy_bank_catalogue", () => prisma.bankAccount.aggregateRaw({ pipeline: sample, options: { maxTimeMS: 15000 } }));
  await check("transaction_statistics", () => prisma.bankTransferTransactionRecord.aggregateRaw({ pipeline: [{ $match: { direction: "CREDIT", status: { $in: ["APPROVED", "IMPORTED"] } } }, { $group: { _id: "$currency", count: { $sum: 1 } } }], options: { maxTimeMS: 15000 } }));
  await check("transaction_listing", () => prisma.bankTransferTransactionRecord.aggregateRaw({ pipeline: [{ $match: { direction: "CREDIT" } }, { $sort: { createdAt: -1, _id: -1 } }, { $limit: 1 }, { $project: { _id: 1 } }], options: { maxTimeMS: 15000 } }));
  await check("transaction_count", () => prisma.$runCommandRaw({ count: "BankTransferTransaction", query: { direction: "CREDIT" } }));
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), readOnly: true, databaseWrites: 0, providerCalls: 0, checks }, null, 2));
  if (checks.some(check => !check.ok)) process.exitCode = 1;
}
main().catch(() => { console.error("Bank transfer readiness audit failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
