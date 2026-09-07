/**
 * Merge duplicate subscription donation rows — two Donation records for ONE Stripe invoice.
 *
 * Cause (fixed in app/api/stripe/webhook/route.ts): the handler looked for the pending
 * checkout row with `{ paidAt: null }`, which on MongoDB does not match a row where the
 * field is ABSENT rather than explicitly null. It therefore missed the row it had already
 * created and inserted a second one for the same invoice. See lib/donations/mongo-null.ts.
 *
 * Strategy per duplicate group, keyed on (subscriptionId, providerOrderId):
 *   - KEEP the earliest-created row. That is the one the checkout flow created, so it is the
 *     id carried in Stripe metadata, on the success page, and in conversion tracking.
 *   - Copy settlement fields (paidAt, billingReason, provider*) from whichever sibling actually
 *     settled, so the kept row reflects the real charge.
 *   - DELETE the surviving siblings together with their DonationItem / DonationCategoryItem
 *     children (the relations do not cascade — that is how the 19 orphaned items already exist).
 *
 * Campaign/category `currentAmount` is deliberately NOT adjusted: the webhook increments once
 * per invoice regardless of which row it wrote, and exactly one row per group remains settled
 * afterwards, so the stored totals stay correct. The script verifies this and refuses to run
 * if a group would change the settled total.
 *
 * DRY RUN BY DEFAULT. Pass --commit to apply.
 */
import { prisma } from "@/lib/prisma";

const COMMIT = process.argv.includes("--commit");

type Row = {
  id: string;
  subscriptionId: string | null;
  providerOrderId: string | null;
  status: string;
  paidAt: Date | null;
  billingReason: string | null;
  providerAuthCode: string | null;
  providerTxnResult: string | null;
  createdAt: Date;
};

async function main() {
  const rows = (await prisma.donation.findMany({
    where: { subscriptionId: { not: null }, providerOrderId: { not: null } },
    select: {
      id: true, subscriptionId: true, providerOrderId: true, status: true, paidAt: true,
      billingReason: true, providerAuthCode: true, providerTxnResult: true, createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  })) as Row[];

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = `${r.subscriptionId}|${r.providerOrderId}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const dupes = [...groups.entries()].filter(([, g]) => g.length > 1);

  console.log(`\n=== ${COMMIT ? "COMMIT" : "DRY RUN (pass --commit to apply)"} ===`);
  console.log(`subscription donations scanned: ${rows.length}`);
  console.log(`duplicate groups: ${dupes.length}\n`);
  if (!dupes.length) { console.log("Nothing to do."); return; }

  let merged = 0, deleted = 0;

  for (const [key, group] of dupes) {
    const keep = group[0];                       // earliest = the checkout row
    const drop = group.slice(1);
    const settled = group.find((r) => r.paidAt != null);

    // Safety: exactly one row in the group may be settled, otherwise the invoice was
    // counted twice and currentAmount would need adjusting — refuse rather than guess.
    const settledCount = group.filter((r) => r.paidAt != null).length;
    if (settledCount > 1) {
      console.log(`SKIP ${key} — ${settledCount} settled rows in one group, needs manual review`);
      continue;
    }

    console.log(`group ${key}`);
    console.log(`  KEEP   ${keep.id}  created=${keep.createdAt.toISOString()} paidAt=${keep.paidAt?.toISOString() ?? "UNSET"}`);
    for (const d of drop) {
      console.log(`  DELETE ${d.id}  created=${d.createdAt.toISOString()} paidAt=${d.paidAt?.toISOString() ?? "UNSET"}`);
    }
    if (settled && settled.id !== keep.id) {
      console.log(`  → copying settlement from ${settled.id} onto the kept row`);
    }

    if (!COMMIT) continue;

    await prisma.$transaction(async (tx) => {
      if (settled && settled.id !== keep.id) {
        await tx.donation.update({
          where: { id: keep.id },
          data: {
            status: "PAID",
            paidAt: settled.paidAt,
            billingReason: settled.billingReason,
            providerAuthCode: settled.providerAuthCode,
            providerTxnResult: settled.providerTxnResult,
          },
        });
        merged += 1;
      }
      for (const d of drop) {
        // Children do not cascade — remove them explicitly so we don't create orphans.
        await tx.donationItem.deleteMany({ where: { donationId: d.id } });
        await tx.donationCategoryItem.deleteMany({ where: { donationId: d.id } });
        await tx.donation.delete({ where: { id: d.id } });
        deleted += 1;
      }
    }, { maxWait: 20_000, timeout: 120_000 });
  }

  console.log(`\nmerged: ${merged} | deleted: ${deleted}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
