import "server-only";
import { cache } from "react";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { whereByIdOrAnyLocaleSlug, whereByIdOrSlug } from "@/lib/slug";
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
                  where: { ...whereByIdOrSlug(key), isActive: true },
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
): { q: string; a: string }[] {
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
