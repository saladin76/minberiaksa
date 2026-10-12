import { PrismaClient } from "@prisma/client";

/**
 * Wipes the bcrypt-hashed security codes saved cards used to keep. A 3–4 digit
 * code hashed is brute-forced in seconds, so keeping it breaks PCI DSS 3.3.1;
 * new cards already store "". Dry run by default — pass --apply to write.
 *
 *   npx tsx scripts/clear-stored-cvc.ts          # count only
 *   npx tsx scripts/clear-stored-cvc.ts --apply  # clear them
 */
const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");
  const withCvc = await prisma.creditCard.count({ where: { NOT: { cvc: "" } } });
  console.log(`Saved cards still holding a security-code hash: ${withCvc}`);
  if (!apply || withCvc === 0) {
    if (!apply) console.log("Dry run. Re-run with --apply to clear them.");
    return;
  }
  const res = await prisma.creditCard.updateMany({ where: { NOT: { cvc: "" } }, data: { cvc: "" } });
  console.log(`Cleared ${res.count} card(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
