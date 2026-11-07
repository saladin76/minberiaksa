import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { parseCategoryPriorities } from "./categories";
import { NOT_SOFT_DELETED } from "./soft-delete-filter";

export function parseProjectRanks(raw: unknown): { id: string; order: number }[] | null {
  if (!Array.isArray(raw) || raw.length > 500) return null;
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item.id !== "string" || !/^[a-f0-9]{24}$/i.test(item.id) || seen.has(item.id) ||
        !Number.isSafeInteger(item.order) || item.order < 0 || item.order > 1_000_000) return null;
    seen.add(item.id);
  }
  return raw;
}

export type ProjectRankWrite = { id: string; data: Prisma.InputJsonObject; expectedUpdatedAt?: Date };

/** One bounded Mongo command inside the caller's transaction, rather than one
 * database round trip per project. All errors abort the whole transaction. */
export async function writeProjectBatch(tx: Pick<Prisma.TransactionClient, "$runCommandRaw">, writes: ProjectRankWrite[]) {
  if (!writes.length) return;
  const now = new Date().toISOString();
  const result = await tx.$runCommandRaw({
    update: "Campaign", ordered: true,
    updates: writes.map(write => ({
      q: { _id: { $oid: write.id }, ...(write.expectedUpdatedAt ? { updatedAt: { $date: write.expectedUpdatedAt.toISOString() } } : {}) },
      u: { $set: { ...write.data, editorVersion: randomUUID(), updatedAt: { $date: now } } },
      multi: false, upsert: false,
    })),
  });
  if (result.ok !== 1 || result.writeConcernError || (Array.isArray(result.writeErrors) ? result.writeErrors.length > 0 : Boolean(result.writeErrors))) throw new Error("PROJECT_BATCH_FAILED");
  if (result.n !== writes.length) throw new Error("CONFLICT");
}

/** Read and write inside one transaction. Never await update promises before it. */
export async function replaceProjectRanks(db: PrismaClient, updates: { id: string; order: number }[], categoryId?: string) {
  await db.$transaction(async tx => {
    if (categoryId && !await tx.category.findUnique({ where: { id: categoryId }, select: { id: true } })) throw new Error("INVALID_SCOPE");
    const rows = await tx.campaign.findMany({
      where: { AND: [NOT_SOFT_DELETED, ...(categoryId ? [{ categoryIds: { has: categoryId } }] : [])] },
      select: { id: true, categoryPriorities: true, priority: true },
    });
    const allowed = new Set(rows.map(row => row.id));
    if (updates.some(row => !allowed.has(row.id))) throw new Error("INVALID_SCOPE");
    const ranks = new Map(updates.map(row => [row.id, row.order]));
    const writes: ProjectRankWrite[] = [];
    for (const row of rows) {
      if (categoryId) {
        const map = parseCategoryPriorities(row.categoryPriorities);
        if (!(categoryId in map) && !ranks.has(row.id)) continue;
        if (ranks.has(row.id)) map[categoryId] = ranks.get(row.id)!;
        else delete map[categoryId];
        writes.push({ id: row.id, data: { categoryPriorities: map } });
      } else if ((row.priority ?? null) !== (ranks.get(row.id) ?? null)) {
        writes.push({ id: row.id, data: { priority: ranks.get(row.id) ?? null } });
      }
    }
    await writeProjectBatch(tx, writes);
  }, { maxWait: 10000, timeout: 30000 });
}
