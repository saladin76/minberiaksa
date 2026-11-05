/** Candidate search only. No bank calls, refunds, messages or database writes. */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
loadEnvConfig(process.cwd(), false);
const db = new PrismaClient();
async function main() {
  const days = Number(process.env.AUDIT_DAYS || "4");
  if (!Number.isInteger(days) || days < 1 || days > 30) throw new Error("INVALID_DAYS");
  const since = new Date(Date.now() - days * 86400000);
  const rows = await db.donation.findMany({
    where: { createdAt: { gte: since }, currency: "TRY", OR: [
      { totalAmount: { gte: 27000, lte: 28000 } },
      { teamSupport: { gte: 10000 } },
    ] },
    select: { id: true, createdAt: true, paidAt: true, status: true, provider: true, providerOrderId: true, currency: true, amount: true, teamSupport: true, totalAmount: true },
    orderBy: { createdAt: "desc" }, take: 101,
  });
  console.log(JSON.stringify({ readOnly: true, providerCalls: 0, databaseWrites: 0, recipientMessages: 0,
    since: since.toISOString(), complete: rows.length <= 100, candidates: rows.slice(0, 100),
    note: "Candidates only: a large donation/support amount does not establish an erroneous charge or identify the reporting donor. No donor contact details, card data or credentials are printed. Match against the donor receipt and bank before any financial resolution." }, null, 2));
}
main().catch(() => { console.error("Incident audit unavailable; check AUDIT_DAYS, database access and generated Prisma client."); process.exitCode = 1; }).finally(() => db.$disconnect());
