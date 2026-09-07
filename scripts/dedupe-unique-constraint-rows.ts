/**
 * Collapse the duplicate rows that block the remaining unique index builds.
 *
 * Both sets have the same cause as the exchange-rate one: on MongoDB a Prisma
 * `@unique` is only enforced once the index exists on the database. Where it was
 * never created, `upsert`/`create` guarded by that field kept inserting.
 *
 *   CommunicationProviderEvent.idempotencyKey — the 15-minute event-sync cron
 *     re-inserted every provider event it saw on every run. This is the exact
 *     failure described in `lib/communication/email-webhook-service.ts`, which
 *     added a `findFirst` pre-check as a workaround; the index makes that
 *     workaround belt-and-braces instead of load-bearing.
 *
 *   DonorCommunicationProfile.userId — two profiles for one donor.
 *
 * Keep rules are conservative:
 *   - Provider events: keep the EARLIEST row (the original observation). All
 *     copies in a group carry the same status and delivery link, so the later
 *     ones add nothing.
 *   - Donor profiles: never drop a restriction. Prefer `doNotContact`, then the
 *     most recent `lastConsentAt`, then the most recently created.
 *
 * Run:  tsx scripts/dedupe-unique-constraint-rows.ts [--apply]
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: [] });
const APPLY = process.argv.includes("--apply");

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) out.set(key(row), [...(out.get(key(row)) ?? []), row]);
  return out;
}

async function dedupeProviderEvents(): Promise<number> {
  const rows = await prisma.communicationProviderEvent.findMany({
    select: { id: true, idempotencyKey: true, createdAt: true },
  });
  const doomed: string[] = [];
  for (const [, group] of groupBy(rows, (r) => r.idempotencyKey)) {
    if (group.length < 2) continue;
    const [, ...rest] = [...group].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    doomed.push(...rest.map((r) => r.id));
  }
  console.log(`[CommunicationProviderEvent] ${rows.length} rows → ${rows.length - doomed.length} unique; ${APPLY ? "deleting" : "would delete"} ${doomed.length}`);
  if (APPLY && doomed.length) {
    // Chunked: a single $in with thousands of ids is a needlessly large command.
    let deleted = 0;
    for (let i = 0; i < doomed.length; i += 500) {
      const res = await prisma.communicationProviderEvent.deleteMany({ where: { id: { in: doomed.slice(i, i + 500) } } });
      deleted += res.count;
    }
    console.log(`[CommunicationProviderEvent] deleted ${deleted}`);
  }
  return doomed.length;
}

async function dedupeDonorProfiles(): Promise<number> {
  const rows = await prisma.donorCommunicationProfile.findMany({
    select: { id: true, userId: true, doNotContact: true, lastConsentAt: true, createdAt: true },
  });
  const doomed: string[] = [];
  for (const [userId, group] of groupBy(rows, (r) => r.userId)) {
    if (group.length < 2) continue;
    const ranked = [...group].sort((a, b) => {
      if (a.doNotContact !== b.doNotContact) return a.doNotContact ? -1 : 1;
      const ac = a.lastConsentAt?.getTime() ?? 0;
      const bc = b.lastConsentAt?.getTime() ?? 0;
      if (ac !== bc) return bc - ac;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    const [keep, ...rest] = ranked;
    console.log(`[DonorCommunicationProfile] user ${userId}: ${group.length} rows — keeping ${keep.id}`);
    doomed.push(...rest.map((r) => r.id));
  }
  console.log(`[DonorCommunicationProfile] ${APPLY ? "deleting" : "would delete"} ${doomed.length}`);
  if (APPLY && doomed.length) {
    const res = await prisma.donorCommunicationProfile.deleteMany({ where: { id: { in: doomed } } });
    console.log(`[DonorCommunicationProfile] deleted ${res.count}`);
  }
  return doomed.length;
}

async function main() {
  const total = (await dedupeProviderEvents()) + (await dedupeDonorProfiles());
  if (!APPLY && total) console.log(`\n${total} row(s) would be deleted. Re-run with --apply.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("dedupe-unique-constraint-rows failed:", error);
  process.exit(1);
});
