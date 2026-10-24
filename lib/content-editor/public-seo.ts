import { contentStore } from "./store";
import { CONFIG, hasText, rows, text } from "./contracts";
import "server-only";
import { cache } from "react";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { whereByIdOrAnyLocaleSlug } from "@/lib/slug";
type Kind = "campaigns" | "categories" | "blog" | "super-categories";
type Extra = {
  seoKeyword: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  seoNoIndex: string | null;
  faqContent: string | null;
};
const select = {
  seoKeyword: true,
  ogTitle: true,
  ogDescription: true,
  ogImage: true,
  seoNoIndex: true,
  faqContent: true,
} as const;
export const readPublicEditorialSeo = cache(
  async (kind: Kind, key: string, locale: string): Promise<Extra | null> => {
    try {
      const visible =
        kind === "campaigns"
          ? {
              isActive: true,
              OR: [{ isDeleted: false }, { isDeleted: { isSet: false } }],
            }
          : kind === "blog"
            ? { published: true }
            : kind === "categories"
              ? {
                  OR: [
                    { isActive: true },
                    { isActive: null },
                    { isActive: { isSet: false } },
                  ],
                }
              : { isActive: true };
      const args = {
        where: { AND: [whereByIdOrAnyLocaleSlug(key), visible] } as Record<
          string,
          unknown
        >,
        select: {
          ...select,
          translations: { where: { locale }, take: 1, select },
        },
      };
      const row =
        kind === "campaigns"
          ? await prisma.campaign.findFirst(args)
          : kind === "categories"
            ? await prisma.category.findFirst(args)
            : kind === "blog"
              ? await prisma.post.findFirst(args)
              : await prisma.superCategory.findFirst({
                  ...args,
                  where: { AND: [whereByIdOrAnyLocaleSlug(key, "translations", true), { isActive: true }] },
                });
      if (!row) return null;
      // Do not display another language's FAQ or indexing override as this locale's copy.
      return locale === "ar" ? row : row.translations[0] || null;
    } catch {
      console.error("Unable to read public editorial metadata");
      return null;
    }
  },
);
export function applyEditorialSeo(
  base: Metadata,
  extra: Extra | null,
): Metadata {
  if (!extra) return base;
  const share = {
    ...(extra.ogTitle ? { title: extra.ogTitle } : {}),
    ...(extra.ogDescription ? { description: extra.ogDescription } : {}),
    ...(extra.ogImage ? { images: [extra.ogImage] } : {}),
  };
  return {
    ...base,
    ...(extra.seoKeyword ? { keywords: extra.seoKeyword } : {}),
    ...(Object.keys(share).length
      ? {
          openGraph: { ...base.openGraph, ...share },
          twitter: { ...base.twitter, ...share },
        }
      : {}),
    ...(extra.seoNoIndex === "true"
      ? {
          robots: {
            ...(typeof base.robots === "object" ? base.robots : {}),
            index: false,
          },
        }
      : {}),
  };
}
export function publicFaq(
  value: string | null | undefined,
): { q: string; a: string; structuredData?: boolean }[] {
  try {
    const rows = JSON.parse(value || "[]");
    return Array.isArray(rows)
      ? rows
          .filter(
            (v) =>
              v &&
              typeof v.q === "string" &&
              typeof v.a === "string" &&
              v.q.trim() &&
              v.a.trim(),
          )
          .slice(0, 30)
      : [];
  } catch {
    return [];
  }
}

export const readPublicEditorialUrls = cache(async (kind: Kind, key: string) => {
  const titleKey = kind === "categories" ? "name" : "title", bodyKey = kind === "blog" ? "content" : kind === "super-categories" ? "intro" : "description";
  const visible = kind === "campaigns" ? { isActive: true, OR: [{ isDeleted: false }, { isDeleted: { isSet: false } }] } : kind === "blog" ? { published: true } : kind === "categories" ? { OR: [{ isActive: true }, { isActive: null }, { isActive: { isSet: false } }] } : { isActive: true };
  try {
    const row = await contentStore.model(CONFIG[kind].model).findFirst({
      where: { AND: [whereByIdOrAnyLocaleSlug(key, "translations", true), visible] },
      select: { id: true, slug: true, [titleKey]: true, [bodyKey]: true, seoNoIndex: true, translations: { select: { locale: true, slug: true, [titleKey]: true, [bodyKey]: true, seoNoIndex: true } } },
    });
    if (!row) return null;
    const bodyRequired = ["campaigns", "blog"].includes(kind) || hasText(row[bodyKey]);
    const complete = (entry: Record<string, unknown>) => hasText(entry[titleKey]) && (!bodyRequired || hasText(entry[bodyKey])) && entry.seoNoIndex !== "true";
    const translations = rows(row.translations);
    return { id: text(row.id), baseSlug: text(row.slug), translations: translations.map((entry) => ({ locale: text(entry.locale), slug: text(entry.slug) || null })),
      availableLocales: [...(complete(row) ? ["ar"] : []), ...translations.filter(complete).map((entry) => text(entry.locale))] };
  } catch { console.error("Unable to read editorial locale URLs"); return null; }
});
