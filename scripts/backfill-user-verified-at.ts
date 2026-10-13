import { PrismaClient } from "@prisma/client";

/**
 * One-off: stamp `User.verifiedAt` on accounts that already show someone used
 * this site themselves, so the dashboard's check mark is right from day one.
 *
 * From now on the app sets it itself (sign-in, email verification, checkout).
 * This covers the accounts that did those things before the field existed:
 *
 *   - a password (registered here, or claimed an imported account),
 *   - a verified email,
 *   - a linked Google/Facebook account,
 *   - with `--created-after=YYYY-MM-DD`, any account created after that date
 *     the day the old site's donors were imported, so guests who gave through
 *     checkout since then count too.
 *
 * The stamp is the account's `updatedAt` (its creation date for the date rule),
 * the best estimate of when they came. Dry run by default; `--apply` writes.
 *
 *   npx tsx scripts/backfill-user-verified-at.ts
 *   npx tsx scripts/backfill-user-verified-at.ts --created-after=2026-05-01 --apply
 */

const prisma = new PrismaClient();
const BATCH = 500;

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const afterRaw = arg("created-after");
  const createdAfter = afterRaw ? new Date(`${afterRaw}T00:00:00.000Z`) : null;
  if (afterRaw && Number.isNaN(createdAfter!.getTime())) throw new Error(`Bad --created-after: ${afterRaw}`);

  const linked = new Set((await prisma.account.findMany({ select: { userId: true } })).map((a) => a.userId));

  let cursor: string | undefined;
  let scanned = 0;
  let already = 0;
  const reasons = { password: 0, emailVerified: 0, linkedAccount: 0, createdAfter: 0 };
  let toStamp = 0;
  let written = 0;

  for (;;) {
    const rows = await prisma.user.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, password: true, emailVerified: true, verifiedAt: true, createdAt: true, updatedAt: true },
    });
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;
    scanned += rows.length;

    for (const u of rows) {
      if (u.verifiedAt) {
        already++;
        continue;
      }
      const reason: keyof typeof reasons | null = u.password
        ? "password"
        : u.emailVerified
          ? "emailVerified"
          : linked.has(u.id)
            ? "linkedAccount"
            : createdAfter && u.createdAt > createdAfter
              ? "createdAfter"
              : null;
      if (!reason) continue;
      const at = reason === "emailVerified" ? u.emailVerified! : reason === "createdAfter" ? u.createdAt : u.updatedAt;

      reasons[reason]++;
      toStamp++;
      if (apply) {
        await prisma.user.update({ where: { id: u.id }, data: { verifiedAt: at } });
        written++;
      }
    }
  }

  console.log({ scanned, alreadyVerified: already, toStamp, ...reasons, stayImported: scanned - already - toStamp, written, mode: apply ? "apply" : "dry-run" });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
