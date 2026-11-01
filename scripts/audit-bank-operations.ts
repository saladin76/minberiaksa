/** Read-only capability audit: no bank requests, financial actions or DB writes. */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { bankOperationsReady } from "../lib/donations/bank-operations-provider";
import { bankDonationSelect } from "../lib/donations/bank-operations-service";
import { bankBalance } from "../lib/donations/bank-operations-core";
loadEnvConfig(process.cwd(), false);
const db = new PrismaClient();
try {
  const rows = await db.donation.findMany({ where: { provider: { in: ["ALBARAKA", "PAYFOR"] }, paidAt: { not: null } }, orderBy: { createdAt: "desc" }, take: 1001, select: bankDonationSelect });
  const providers: Record<string, { sampled: number; ready: number; blocked: number; confirmedAdjustments: number; reasons: Record<string, number> }> = {};
  for (const row of rows.slice(0, 1000)) {
    const group = providers[row.provider!] ||= { sampled: 0, ready: 0, blocked: 0, confirmedAdjustments: 0, reasons: {} }; group.sampled++;
    const readiness = bankOperationsReady(row); if (readiness.ready) group.ready++; else group.reasons[readiness.reason || "BANK_NOT_CONFIGURED"] = (group.reasons[readiness.reason || "BANK_NOT_CONFIGURED"] || 0) + 1;
    try { const balance = bankBalance(row); if (balance.blocked) group.blocked++; group.confirmedAdjustments += balance.operations.filter(op => op.state === "SUCCEEDED").length; }
    catch { group.reasons.LEDGER_REVIEW_REQUIRED = (group.reasons.LEDGER_REVIEW_REQUIRED || 0) + 1; }
  }
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), readOnly: true, providerCalls: 0, databaseWrites: 0, complete: rows.length <= 1000, providers, note: "Configuration readiness does not prove terminal permissions, financial acceptance, or external refunds. No credentials, card data, donor information or donation IDs are printed." }, null, 2));
} catch { console.error("Bank operations audit unavailable; check database access and generated Prisma client."); process.exitCode = 1; }
finally { await db.$disconnect(); }
