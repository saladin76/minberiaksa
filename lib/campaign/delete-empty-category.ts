import type { Prisma, PrismaClient } from "@prisma/client";
import { contentVersionPatch, contentWriteWhere } from "../content-editor/legacy-write";

type Actor = { actorId?: string | null; actorName?: string | null; actorRole: string };

/** Delete a genuinely empty category, including stale links to projects already
 * in the trash. Financial records and every project itself are retained. */
export async function deleteEmptyCategory(database: Pick<PrismaClient, "$transaction">, where: Prisma.CategoryWhereInput, actor: Actor) {
  return database.$transaction(async tx => {
    const category = await tx.category.findFirst({ where, select: { id: true, name: true, editorVersion: true } });
    if (!category) return { state: "not_found" as const };
    const id = category.id;
    const [projects, donations, subscriptions, pages] = await Promise.all([
      tx.campaign.findMany({ where: { categoryIds: { has: id } }, select: { id: true, isActive: true, isDeleted: true } }),
      tx.donationCategoryItem.count({ where: { categoryId: id } }),
      tx.subscriptionCategoryItem.count({ where: { categoryId: id } }),
      tx.superCategoryItem.count({ where: { refId: id } }),
    ]);
    const live = projects.filter(row => row.isDeleted !== true);
    const references = { projects: live.length, deletedProjects: projects.length - live.length, donations, subscriptions, pages };
    if (live.length || donations || subscriptions || pages) return { state: "blocked" as const, references };

    // A category edit/connection made concurrently must conflict with this
    // transaction rather than be silently discarded by the deletion.
    await tx.category.update({ where: contentWriteWhere({ id }, { expectedEditorVersion: category.editorVersion ?? null }), data: { campaignIds: [], ...contentVersionPatch() } });
    const detached = await tx.$runCommandRaw({
      update: "Campaign",
      updates: [{ q: { categoryIds: { $oid: id } }, u: { $pull: { categoryIds: { $oid: id } }, $unset: { [`categoryPriorities.${id}`]: "" }, $set: { updatedAt: { $date: new Date().toISOString() } } }, multi: true }],
    });
    const errors = detached.writeErrors;
    if (detached.ok !== 1 || (Array.isArray(errors) ? errors.length > 0 : Boolean(errors)) || detached.writeConcernError) throw new Error("CATEGORY_DETACH_FAILED");
    await tx.category.delete({ where: { id } });
    await tx.auditLog.create({ data: { ...actor, action: "CATEGORY_DELETE", entityType: "Category", entityId: id, stream: "TEAM", messageAr: `حذف التصنيف: ${category.name} مع إبقاء سجلات المشاريع والتبرعات`, metadata: { detachedDeletedProjects: Number(detached.nModified || 0), projectsDeleted: 0, financialRecordsChanged: false } } });
    return { state: "deleted" as const, detachedDeletedProjects: Number(detached.nModified || 0) };
  }, { maxWait: 10000, timeout: 30000 });
}
