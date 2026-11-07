import type { Prisma } from "@prisma/client";

/** MongoDB distinguishes an explicit null from a field absent on legacy rows. */
export const RANKED_CAMPAIGNS = {
  priority: { not: null, isSet: true },
} satisfies Prisma.CampaignWhereInput;
export const UNRANKED_CAMPAIGNS = {
  OR: [{ priority: null }, { priority: { isSet: false } }],
} satisfies Prisma.CampaignWhereInput;
