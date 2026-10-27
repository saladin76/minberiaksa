import type { Prisma } from "@prisma/client";

/** Actual marketing acceptances across every channel. A later delivery failure does not erase the contact attempt. */
export function recentMarketingDeliveryWhere(days: number, now = new Date()): Prisma.CommunicationDeliveryWhereInput {
  if (!Number.isSafeInteger(days) || days < 1 || days > 3650) throw new Error("INVALID_MARKETING_EXCLUSION_DAYS");
  return {
    purpose: "MARKETING",
    sentAt: { gte: new Date(now.getTime() - days * 86_400_000), lte: now },
    OR: [{ status: { in: ["SENT_TO_PROVIDER", "SENT", "DELIVERED", "READ", "OPENED", "CLICKED", "REPLIED"] } }, { providerMessageId: { not: null } }],
  };
}
