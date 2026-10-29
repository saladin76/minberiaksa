import type { PrismaClient } from "@prisma/client";
import { NOT_SOFT_DELETED } from "./soft-delete-filter";

export type CategoryProjectCounts = { published: number; archived: number; total: number };

/** The public catalogue uses Campaign.categoryIds, not stale inverse Category.campaignIds. */
export async function categoryProjectCounts(database: Pick<PrismaClient, "campaign">, categoryIds: readonly string[]) {
  const ids = [...new Set(categoryIds)];
  const counts = new Map<string, CategoryProjectCounts>(ids.map(id => [id, { published: 0, archived: 0, total: 0 }]));
  if (!ids.length) return counts;
  const membership = [NOT_SOFT_DELETED, { categoryIds: { hasSome: ids } }];
  const [all, published] = await Promise.all([
    database.campaign.findMany({ where: { AND: membership }, select: { categoryIds: true } }),
    database.campaign.findMany({ where: { AND: [...membership, { isActive: true }] }, select: { categoryIds: true } }),
  ]);
  for (const row of all) for (const id of new Set(row.categoryIds)) { const count = counts.get(id); if (count) count.total++; }
  for (const row of published) for (const id of new Set(row.categoryIds)) { const count = counts.get(id); if (count) count.published++; }
  for (const count of counts.values()) count.archived = Math.max(0, count.total - count.published);
  return counts;
}
