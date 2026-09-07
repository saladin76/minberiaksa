/**
 * Sanity check: confirm Prisma accepts `null` for a nullable Json field.
 * Updates the campaign in the error report with the exact `data` shape the
 * route now produces, then reverts.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CAMPAIGN_ID = "69f444a6f7d0969fdc270868";

async function main() {
  const before = await prisma.campaign.findUnique({
    where: { id: CAMPAIGN_ID },
    select: { categoryPriorities: true },
  });
  console.log("Before:", before);

  await prisma.campaign.update({
    where: { id: CAMPAIGN_ID },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { categoryPriorities: null } as any,
  });
  console.log("✓ Update with categoryPriorities: null succeeded");

  const after = await prisma.campaign.findUnique({
    where: { id: CAMPAIGN_ID },
    select: { categoryPriorities: true },
  });
  console.log("After:", after);

  // Restore prior value if any.
  if (before?.categoryPriorities) {
    await prisma.campaign.update({
      where: { id: CAMPAIGN_ID },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { categoryPriorities: before.categoryPriorities as any },
    });
    console.log("✓ Restored prior categoryPriorities");
  }
}

main()
  .catch((err) => {
    console.error("✗ FAILED:", err.message ?? err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
