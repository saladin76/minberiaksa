import "server-only";
import { randomUUID } from "node:crypto";
import { cache } from "react";
import { prisma } from "../prisma";
import { messagesFor } from "../../i18n/locale-messages";
import { buildPageMetadata, LOCALE_SEO, type Locale } from "../seo";
import { SUPPORTED_LOCALES } from "../locales";
import { applyEditorialSeo } from "./public-seo";
import { fieldsFor, validateChanges } from "./contracts";
import { ContentError } from "./service";
import { managedSeoPage, PAGE_SEO_FIELDS, type PageSeoLocales, type PageSeoValues } from "./page-seo-registry";

function valueAt(input: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, input);
}
export function pageSeoDefaults(key: string, locale: string) {
  const page = managedSeoPage(key); if (!page) throw new ContentError("صفحة غير صالحة", 404);
  const messages = messagesFor(locale), namespace = valueAt(messages, page.namespace);
  const seo = LOCALE_SEO[locale as Locale] || LOCALE_SEO.en;
  const section = key === "blog" ? seo.blog : key === "projects" || key === "legacyCampaigns" ? seo.campaigns : key === "contact" ? seo.contact : seo;
  const title = page.titleKeys.length ? page.titleKeys.map((field) => String(valueAt(namespace, field) || "")).join(" ") : section.title;
  const description = page.descriptionKey ? String(valueAt(namespace, page.descriptionKey) || "") : section.description;
  return { values: { metaTitle: title, metaDescription: description, seoKeyword: seo.keywords.join(", "), ogTitle: title, ogDescription: description, imageAlt: title, ogImage: "", seoNoIndex: "false" }, context: JSON.stringify(namespace || {}).slice(0, 20000) };
}
export function validatePageSeoOverrides(input: unknown): PageSeoLocales {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ContentError("إعدادات SEO غير صالحة");
  const result: PageSeoLocales = {};
  const allowed = new Set<string>([...PAGE_SEO_FIELDS.map(([key]) => key), "seoNoIndex"]);
  for (const [locale, values] of Object.entries(input)) {
    if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale) || !values || typeof values !== "object" || Array.isArray(values) || Object.keys(values).some((key) => !allowed.has(key))) throw new ContentError("حقول أو لغات غير صالحة");
    try { result[locale] = validateChanges(fieldsFor("blog", {}), values); }
    catch (error) { throw new ContentError(error instanceof Error ? error.message : "قيم غير صالحة"); }
  }
  return result;
}
export async function readPageSeoDocument(key: string) {
  if (!managedSeoPage(key)) throw new ContentError("صفحة غير صالحة", 404);
  const row = await prisma.managedPageSeo.findUnique({ where: { key } });
  return { key, revision: row?.version || null, overrides: (row?.overrides || {}) as PageSeoLocales,
    defaults: Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, pageSeoDefaults(key, locale).values])) };
}
export async function savePageSeoDocument(key: string, revision: string | null, input: unknown) {
  if (!managedSeoPage(key)) throw new ContentError("صفحة غير صالحة", 404);
  const overrides = validatePageSeoOverrides(input), version = randomUUID();
  if (revision) {
    const result = await prisma.managedPageSeo.updateMany({ where: { key, version: revision }, data: { overrides, version } });
    if (result.count !== 1) throw new ContentError("تغيرت إعدادات الصفحة. احتفظ بالمسودة وأعد تحميل النسخة الحالية.", 409);
  } else {
    try { await prisma.managedPageSeo.create({ data: { key, overrides, version } }); }
    catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new ContentError("تغيرت إعدادات الصفحة. أعد تحميلها أولًا.", 409);
      throw error;
    }
  }
  return readPageSeoDocument(key);
}
export const readManagedPageValues = cache(async (key: string, locale: string): Promise<PageSeoValues | null> => {
  try {
    const row = await prisma.managedPageSeo.findUnique({ where: { key } });
    return (row?.overrides as PageSeoLocales | null)?.[locale] || null;
  } catch { console.error("Unable to read managed page metadata"); return null; }
});
export async function buildManagedPageMetadata(key: string, locale: string, input: Parameters<typeof buildPageMetadata>[1]) {
  const values = await readManagedPageValues(key, locale);
  if (!values) return buildPageMetadata(locale, input);
  const base = buildPageMetadata(locale, { ...input, title: values.metaTitle || input.title, description: values.metaDescription || input.description, imageAlt: values.imageAlt || input.imageAlt });
  return applyEditorialSeo(base, { seoKeyword: values.seoKeyword || null, ogTitle: values.ogTitle || null, ogDescription: values.ogDescription || null, ogImage: values.ogImage || null, seoNoIndex: values.seoNoIndex || null, faqContent: null });
}
