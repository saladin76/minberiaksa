import { createHash } from 'node:crypto';

export const RETIRED_SADAQAH_ID = '6aa2eb54817054fc3dd6b2c7';
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function inspectRetiredCategory(db) {
  const category = await db.category.findUnique({ where: { id: RETIRED_SADAQAH_ID } });
  if (!category) return { absent: true };
  if (category.name !== 'صدقة' || category.isActive !== false) throw new Error('CATEGORY_CHANGED_OR_NOT_ARCHIVED');
  const [projects, donations, subscriptions, pages] = await Promise.all([
    db.campaign.findMany({ where: { OR: [{ categoryIds: { has: category.id } }, { id: { in: category.campaignIds || [] } }] },
      select: { id: true, categoryIds: true, categoryPriorities: true, editorVersion: true, updatedAt: true, isActive: true, isDeleted: true }, orderBy: { id: 'asc' } }),
    db.donationCategoryItem.count({ where: { categoryId: category.id } }),
    db.subscriptionCategoryItem.count({ where: { categoryId: category.id } }),
    db.superCategoryItem.count({ where: { refId: category.id } }),
  ]);
  if (donations || subscriptions || pages) throw new Error('CATEGORY_HAS_FINANCIAL_OR_PAGE_REFERENCES');
  const snapshot = { category, projects };
  return { absent: false, snapshot, hash: fingerprint(snapshot), projectCount: projects.length };
}

/** Owner CLI only. Removes one reviewed archived label; never deletes a project or financial row. */
export async function cleanRetiredCategory(db, { apply = false, expectedProjects, saveBackup }) {
  const reviewed = await inspectRetiredCategory(db);
  if (reviewed.absent) return { readOnly: true, alreadyAbsent: true, projectsDeleted: 0, financialRecordsChanged: false };
  if (!Number.isSafeInteger(expectedProjects) || reviewed.projectCount !== expectedProjects) throw new Error('PROJECT_SCOPE_CHANGED_REVIEW_REQUIRED');
  if (!apply) return { readOnly: true, reviewHash: reviewed.hash, projectCount: reviewed.projectCount, category: 'صدقة', projectsDeleted: 0, financialRecordsChanged: false };
  // A failed/private backup must stop the mutation, and the transaction rechecks its exact snapshot.
  const backup = await saveBackup(reviewed.snapshot);
  if (typeof backup !== 'string' || !backup) throw new Error('BACKUP_REQUIRED');
  const result = await db.$transaction(async tx => {
    const fresh = await inspectRetiredCategory(tx);
    if (fresh.absent || fresh.hash !== reviewed.hash) throw new Error('CATEGORY_OR_PROJECTS_CHANGED_RELOAD');
    const id = RETIRED_SADAQAH_ID;
    const changed = await tx.$runCommandRaw({ update: 'Campaign', updates: [{
      q: { _id: { $in: fresh.snapshot.projects.map(row => ({ $oid: row.id })) } },
      u: { $pull: { categoryIds: { $oid: id } }, $unset: { [`categoryPriorities.${id}`]: '' }, $set: { updatedAt: { $date: new Date().toISOString() } } }, multi: true,
    }] });
    if (changed.ok !== 1 || changed.writeErrors || Number(changed.n) !== fresh.projectCount) throw new Error('PROJECT_DETACH_FAILED');
    await tx.category.delete({ where: { id } });
    await tx.auditLog.create({ data: { actorRole: 'SYSTEM', stream: 'TEAM', action: 'CATEGORY_DETACH_DELETE', entityType: 'Category', entityId: id,
      messageAr: 'حذف تصنيف صدقة المؤرشف بطلب مالك الموقع مع إبقاء جميع المشاريع وسجلاتها المالية',
      metadata: { detachedProjects: fresh.projectCount, projectsDeleted: 0, financialRecordsChanged: false, backup, reviewHash: reviewed.hash } } });
    return { detachedProjects: fresh.projectCount };
  }, { maxWait: 10_000, timeout: 30_000 });
  const remaining = await db.category.findUnique({ where: { id: RETIRED_SADAQAH_ID }, select: { id: true } });
  const linked = await db.campaign.count({ where: { categoryIds: { has: RETIRED_SADAQAH_ID } } });
  if (remaining || linked) throw new Error('CLEANUP_READBACK_FAILED_INSPECT_BEFORE_RETRY');
  return { readOnly: false, ...result, backup, verifiedAbsent: true, projectsDeleted: 0, financialRecordsChanged: false };
}
