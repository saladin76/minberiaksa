/** Read-only impact report. Run on the VPS; never deletes or changes records. */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
export const RETIRED_CATEGORY_LABELS = ["سوريا", "السودان", "اليمن", "لبنان", "بنغلاديش", "توغو وبنين", "تشاد", "إثيوبيا", "البوسنة", "ألبانيا", "مقدونيا الشمالية", "صربيا", "الكاميرون", "بوركينا فاسو", "الصومال", "عام", "صدقة"];
const normalize = value => String(value).normalize("NFKC").replace(/\s+/g, " ").trim();
export function categoryCleanupScope(categories, campaigns) {
  const labels = new Set(RETIRED_CATEGORY_LABELS.map(normalize));
  const selected = categories.filter(row => row.isActive === false && labels.has(normalize(row.name)));
  const selectedIds = new Set(selected.map(row => row.id));
  const mirrorIds = new Set(selected.flatMap(row => row.campaignIds || []));
  const projects = campaigns.filter(row => mirrorIds.has(row.id) || row.categoryIds?.some(id => selectedIds.has(id))).map(row => {
    const outsideCategoryIds = categories.filter(category => !selectedIds.has(category.id) && ((row.categoryIds || []).includes(category.id) || (category.campaignIds || []).includes(row.id))).map(category => category.id);
    return { id: row.id, title: row.title, slug: row.slug, active: row.isActive, deleted: row.isDeleted === true, outsideCategoryIds };
  }).sort((a,b) => a.id.localeCompare(b.id));
  const missingLabels = RETIRED_CATEGORY_LABELS.filter(label => !selected.some(row => normalize(row.name) === normalize(label)));
  return { selected: selected.map(row => ({ id: row.id, name: row.name, slug: row.slug, relationshipCount: row.campaignIds?.length || 0 })).sort((a,b) => a.id.localeCompare(b.id)), projects, missingLabels, sharedProjectCount: projects.filter(row => row.outsideCategoryIds.length).length };
}
export async function auditCategoryCleanup(prisma) {
  const categories = await prisma.category.findMany({ select: { id: true, name: true, slug: true, isActive: true, campaignIds: true } });
  const targets = categories.filter(row => row.isActive === false && RETIRED_CATEGORY_LABELS.map(normalize).includes(normalize(row.name)));
  const ids = targets.map(row => row.id), mirrored = [...new Set(targets.flatMap(row => row.campaignIds || []))];
  const campaigns = ids.length ? await prisma.campaign.findMany({ where: { OR: [{ categoryIds: { hasSome: ids } }, { id: { in: mirrored } }] }, select: { id: true, title: true, slug: true, categoryIds: true, isActive: true, isDeleted: true } }) : [];
  const scope = categoryCleanupScope(categories, campaigns), projectIds = scope.projects.map(row => row.id);
  const count = (model, where) => prisma[model].count({ where });
  const entries = await Promise.all([
    ['projectDonationItems', count('donationItem', { campaignId: { in: projectIds } })],
    ['paidProjectDonationItems', count('donationItem', { campaignId: { in: projectIds }, donation: { status: 'PAID' } })],
    ['categoryDonationItems', count('donationCategoryItem', { categoryId: { in: ids } })],
    ['paidCategoryDonationItems', count('donationCategoryItem', { categoryId: { in: ids }, donation: { status: 'PAID' } })],
    ['projectSubscriptionItems', count('subscriptionItem', { campaignId: { in: projectIds } })],
    ['activeProjectSubscriptionItems', count('subscriptionItem', { campaignId: { in: projectIds }, subscription: { status: 'ACTIVE' } })],
    ['categorySubscriptionItems', count('subscriptionCategoryItem', { categoryId: { in: ids } })],
    ['activeCategorySubscriptionItems', count('subscriptionCategoryItem', { categoryId: { in: ids }, subscription: { status: 'ACTIVE' } })],
    ['cartItems', count('cartItem', { campaignId: { in: projectIds } })],
    ['superCategoryReferences', count('superCategoryItem', { refId: { in: [...ids, ...projectIds] } })],
    ['videoReferences', count('video', { campaignIds: { hasSome: projectIds } })],
    ['slugRedirects', count('campaignSlugRedirect', { campaignId: { in: projectIds } })],
  ].map(async ([key, result]) => [key, await result]));
  const references = Object.fromEntries(entries);
  const reviewHash = createHash('sha256').update(JSON.stringify({ scope, references })).digest('hex');
  return { checkedAt: new Date().toISOString(), readOnly: true, databaseWrites: 0, reviewHash, ...scope, distinctProjectCount: projectIds.length, references, blockingIssues: [
    ...(scope.missingLabels.length ? ['TARGET_LABELS_MISSING_OR_NOT_ARCHIVED'] : []),
    ...(scope.sharedProjectCount ? ['PROJECTS_SHARED_WITH_OTHER_CATEGORIES'] : []),
    ...(references.projectDonationItems || references.categoryDonationItems ? ['FINANCIAL_HISTORY_MUST_REMAIN_REFERENTIALLY_VALID'] : []),
    ...(references.activeProjectSubscriptionItems || references.activeCategorySubscriptionItems ? ['ACTIVE_SUBSCRIPTIONS_REQUIRE_PROJECT_DECISION'] : []),
  ], notes: ['No donor contacts, payment references or credentials are included.', 'Relationship counts are not distinct project counts.', 'وقف and أضاحي are outside the requested screenshot scope.', 'This is not a deletion command. Review references and financial retention before preparing a destructive operation.'] };
}
async function main() {
  const require = createRequire(resolve(process.cwd(), 'package.json'));
  require('@next/env').loadEnvConfig(process.cwd(), false);
  const { PrismaClient } = require('@prisma/client'), prisma = new PrismaClient();
  try { console.log(JSON.stringify(await auditCategoryCleanup(prisma), null, 2)); } finally { await prisma.$disconnect(); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch(() => { console.error('Read-only category audit failed. No records were changed; verify app directory and database access.'); process.exitCode = 1; });
