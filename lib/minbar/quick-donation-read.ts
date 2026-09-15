import { prisma } from "@/lib/prisma";
import { parseQuickDonation, type QuickDonationConfig } from "./quick-donation";

/**
 * The quick-donation config as the homepage reads it — server only. Kept out
 * of `quick-donation.ts` so the dashboard form and the card can import the
 * types and parser without pulling Prisma into a client bundle.
 *
 * A database that is down or a row that is missing yields the defaults: the
 * homepage must still show a donation card.
 */
export async function readQuickDonation(): Promise<QuickDonationConfig> {
  try {
    const row = await prisma.globalSettings.findFirst({
      orderBy: { createdAt: "asc" },
      select: { quickDonation: true },
    });
    return parseQuickDonation(row?.quickDonation ?? null);
  } catch (e) {
    console.error("readQuickDonation:", e);
    return parseQuickDonation(null);
  }
}
