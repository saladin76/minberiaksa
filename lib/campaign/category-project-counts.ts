import type { PrismaClient } from "@prisma/client";

export type CategoryProjectCounts = { published: number; archived: number; deleted: number; total: number };

/** The public catalogue uses Campaign.categoryIds, not stale inverse Category.campaignIds. */
export async function categoryProjectCounts(database: Pick<PrismaClient, "campaign">, categoryIds: readonly string[]) {
  const ids = [...new Set(categoryIds)];
  const counts = new Map<string, CategoryProjectCounts>(ids.map(id => [id, { published: 0, archived: 0, deleted: 0, total: 0 }]));
  if (!ids.length) return counts;
  const all = await database.campaign.findMany({ where: { categoryIds: { hasSome: ids } }, select: { categoryIds: true, isActive: true, isDeleted: true } });
  for (const row of all) for (const id of new Set(row.categoryIds)) {
    const count = counts.get(id); if (!count) continue;
    if (row.isDeleted === true) { count.deleted++; continue; }
    count.total++;
    if (row.isActive === true) count.published++;
  }
  for (const count of counts.values()) count.archived = Math.max(0, count.total - count.published);
  return counts;
}
