import "server-only";
import { prisma } from "@/lib/prisma";
import { CATEGORY_ACTIVE_OR_UNSET } from "@/lib/campaign/soft-delete-filter";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import { applyProjectFilterOrder, programmeProjectIds } from "./project-filter-options";
import type { MinbarProject } from "./projects";
import type { PrismaClient } from "@prisma/client";

export async function readProjectFilterRegistry(locale: string, projects: readonly MinbarProject[], database: Pick<PrismaClient, "category" | "superCategory" | "globalSettings"> = prisma) {
  const [categories, programmes, settings] = await Promise.all([
    database.category.findMany({ where: CATEGORY_ACTIVE_OR_UNSET, select: { id: true, name: true, slug: true, icon: true, order: true, translations: { where: translationLocaleWhere(locale), select: { locale: true, name: true, slug: true } } } }),
    database.superCategory.findMany({ where: { isActive: true }, select: { id: true, title: true, slug: true, order: true, translations: { where: translationLocaleWhere(locale), select: { locale: true, title: true, slug: true } }, items: { orderBy: [{ order: "asc" }, { id: "asc" }], select: { kind: true, refId: true } }, blocks: { select: { kind: true, isActive: true, maxItems: true } } } }),
    database.globalSettings.findFirst({ orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, updatedAt: true, projectFilterOrder: true } }),
  ]);
  const published = new Set(projects.map(project => project.id));
  const items = applyProjectFilterOrder([
    ...categories.map(row => { const translation = pickTranslation(row.translations, locale); return { key: `category:${row.id}`, id: row.id, kind: "category" as const, name: translation?.name || row.name, slug: translation?.slug || row.slug || row.id, icon: row.icon || "layout-grid", order: row.order, projectIds: projects.filter(project => project.categories.some(category => category.id === row.id)).map(project => project.id) }; }),
    ...programmes.map(row => { const translation = pickTranslation(row.translations, locale); return { key: `programme:${row.id}`, id: row.id, kind: "programme" as const, name: translation?.title || row.title, slug: translation?.slug || row.slug, icon: "landmark", order: row.order, projectIds: programmeProjectIds(row.items, row.blocks, published) }; }),
  ], settings?.projectFilterOrder);
  return { items, settings };
}

export async function listProjectFilters(locale: string, projects: readonly MinbarProject[]) { return (await readProjectFilterRegistry(locale, projects)).items; }
