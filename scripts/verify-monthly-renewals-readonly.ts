import { loadEnvConfig } from "@next/env";
import { prisma } from "../lib/prisma";
import { loadSubscriptionFrequencies } from "../lib/dashboard/recurring-frequency-filter";
import { renewalEvidence } from "../lib/donations/renewal-evidence";
import { bankDonationSelect } from "../lib/donations/bank-operations-service";
import { bankOperationsReady, callBankOperation } from "../lib/donations/bank-operations-provider";
import { inspectBankReply } from "../lib/donations/bank-operations-inspection";

loadEnvConfig(process.cwd());
async function main() {
  const since = new Date(Date.now() - 30 * 86400000);
  const rows = await prisma.donation.findMany({ where: { createdAt: { gte: since }, OR: [{ billingReason: "subscription_cycle" }, { providerTxnType: "RecurringSale" }] }, orderBy: { createdAt: "desc" }, take: 1001,
    select: { id: true, provider: true, billingReason: true, providerTxnType: true, subscriptionId: true, paidAt: true, status: true, providerTxnResult: true, providerProcReturnCode: true, createdAt: true } });
  const frequencyOf = await loadSubscriptionFrequencies(prisma, rows.map(row => row.subscriptionId).filter((id): id is string => Boolean(id)));
  const monthly = rows.filter(row => row.billingReason !== "subscription_test_cycle" && frequencyOf(row.subscriptionId) === "MONTHLY");
  const evidence = renewalEvidence(monthly.slice(0, 1000), frequencyOf, since, rows.length <= 1000);
  const bankChecks: Array<Record<string, unknown>> = [];
  if (process.argv.includes("--bank-check")) {
    for (const sample of monthly.filter(row => row.provider === "ALBARAKA").slice(0, 3)) {
      const donation = await prisma.donation.findUnique({ where: { id: sample.id }, select: bankDonationSelect });
      if (!donation) continue;
      const ready = bankOperationsReady(donation);
      if (!ready.ready) { bankChecks.push({ donationId: donation.id, configured: false, reason: ready.reason }); continue; }
      try {
        // Fixed read-only action: this script cannot initiate, refund, void or retry a charge.
        const reply = await callBankOperation(donation, "INQUIRE", `AUDIT${donation.id}`);
        const inspection = inspectBankReply(donation, reply);
        bankChecks.push({ donationId: donation.id, inquiryState: reply.code === "E219" ? "NOT_FOUND" : reply.state === "SUCCEEDED" ? inspection.verified ? "VERIFIED" : "UNVERIFIED" : reply.state === "DECLINED" ? "QUERY_REJECTED" : "UNKNOWN", code: reply.code, collectionStatus: sample.status, collectionCode: sample.providerProcReturnCode, originalSaleVerified: inspection.verified, returnedMinor: inspection.verified ? inspection.returnedMinor : null });
      } catch { bankChecks.push({ donationId: donation.id, inquiryState: "UNKNOWN" }); }
    }
  }
  console.log(JSON.stringify({ readOnly: true, databaseWrites: 0, paymentCaptures: 0, financialAdjustments: 0, recipientMessages: 0, evidence, bankChecks }, null, 2));
}
main().catch(error => { console.error(JSON.stringify({ error: "MONTHLY_READONLY_AUDIT_FAILED", name: error instanceof Error ? error.name : "Unknown" })); process.exitCode = 1; }).finally(() => prisma.$disconnect());
