import { CONFIG, fieldsFor, hasText, localeStatus, text, validateChanges, valuesFor, type ContentKind, type ContentRecord } from "./contracts";
import { SUPPORTED_LOCALES } from "../locales";

export const READINESS_KINDS = ["campaigns", "categories", "super-categories", "blog"] as const;
export type ReadinessKind = typeof READINESS_KINDS[number];
export type ReadinessState = { contentMissing: string[]; seoMissing: string[]; invalid: string[]; complete: boolean };
export type ReadinessItem = { id: string; title: string; kind: ReadinessKind; locales: Record<string, ReadinessState> };
export type ReadinessPage = { items: ReadinessItem[]; nextCursor: string | null; checkedAt: string };
export function isReadinessKind(value: unknown): value is ReadinessKind { return READINESS_KINDS.includes(value as ReadinessKind); }

/** Keep content and donor data server-side. Only field names and readiness leave this boundary. */
export function contentReadiness(kind: ReadinessKind, row: ContentRecord): ReadinessItem {
  const fields = fieldsFor(kind, row), source = valuesFor(kind, row, "ar");
  const seo = fields.filter(field => field.group === "seo" && /^(seoTitle|metaTitle|seoDescription|metaDescription|imageAlt)$/.test(field.key) && (field.key !== "imageAlt" || field.required));
  const locales = Object.fromEntries(SUPPORTED_LOCALES.map(locale => {
    const values = valuesFor(kind, row, locale);
    const contentMissing = localeStatus(fields, source, values, locale).missing;
    const seoMissing = seo.filter(field => !hasText(values[field.key]) || locale !== "ar" && /[\u0600-\u06ff]/.test(source[field.key] || "") && values[field.key]?.trim() === source[field.key]?.trim()).map(field => field.key);
    const invalid = fields.filter(field => { try { validateChanges(fields, { [field.key]: values[field.key] || "" }); return false; } catch { return true; } }).map(field => field.key);
    return [locale, { contentMissing, seoMissing, invalid, complete: !contentMissing.length && !seoMissing.length && !invalid.length }];
  }));
  return { id: text(row.id), title: text(row.title || row.name), kind, locales };
}
export function readinessEditorHref(kind: ContentKind, id: string, locale: string, section: "content" | "seo") {
  return `/dashboard/content/${kind}/${id}?locale=${encodeURIComponent(locale)}&section=${section}`;
}
export function readinessLabel(kind: ReadinessKind) { return CONFIG[kind].label; }
