import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { SITE_URL, LOCALES } from "@/lib/seo";

const STATIC_PATHS = [
  { path: "", changeFreq: "daily" as const, priority: 1.0 },
  { path: "/campaigns", changeFreq: "daily" as const, priority: 0.9 },
  { path: "/about-us", changeFreq: "monthly" as const, priority: 0.7 },
  { path: "/contact-us", changeFreq: "monthly" as const, priority: 0.6 },
  { path: "/bank-transfer", changeFreq: "monthly" as const, priority: 0.75 },
  { path: "/blog", changeFreq: "weekly" as const, priority: 0.8 },
];

function buildStaticAlternates(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of LOCALES) {
    languages[locale] = `${SITE_URL}/${locale}${path}`;
  }
  languages["x-default"] = `${SITE_URL}/ar${path}`;
  return languages;
}

function pickSlugFor(
  locale: string,
  baseSlug: string | null | undefined,
  translations: { locale: string; slug: string | null }[],
  fallback: string,
): string {
  const t = translations.find((tt) => tt.locale === locale && tt.slug);
  return t?.slug || baseSlug || fallback;
}

function buildLocaleAlternatesForEntity(
  basePath: string,
  baseSlug: string | null | undefined,
  translations: { locale: string; slug: string | null }[],
  fallback: string,
): Record<string, string> {
  const url = (loc: string): string =>
    `${SITE_URL}/${loc}${basePath}/${encodeURIComponent(
      pickSlugFor(loc, baseSlug, translations, fallback),
    )}`;
  const languages: Record<string, string> = {};
  for (const locale of LOCALES) languages[locale] = url(locale);
  languages["x-default"] = url("ar");
  return languages;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  for (const { path, changeFreq, priority } of STATIC_PATHS) {
    for (const locale of LOCALES) {
      entries.push({
        url: `${SITE_URL}/${locale}${path}`,
        lastModified: new Date(),
        changeFrequency: changeFreq,
        priority,
        alternates: { languages: buildStaticAlternates(path) },
      });
    }
  }

  try {
    const campaigns = await prisma.campaign.findMany({
      where: { isActive: true },
      select: {
        id: true,
        slug: true,
        updatedAt: true,
        translations: { select: { locale: true, slug: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    for (const c of campaigns) {
      const languages = buildLocaleAlternatesForEntity(
        "/campaign",
        c.slug,
        c.translations,
        c.id,
      );
      for (const locale of LOCALES) {
        entries.push({
          url: languages[locale],
          lastModified: c.updatedAt,
          changeFrequency: "weekly",
          priority: 0.85,
          alternates: { languages },
        });
      }
    }
  } catch {
  }

  try {
    const categories = await prisma.category.findMany({
      select: {
        id: true,
        slug: true,
        translations: { select: { locale: true, slug: true } },
      },
    });

    for (const cat of categories) {
      const languages = buildLocaleAlternatesForEntity(
        "/category",
        cat.slug,
        cat.translations,
        cat.id,
      );
      for (const locale of LOCALES) {
        entries.push({
          url: languages[locale],
          lastModified: new Date(),
          changeFrequency: "weekly",
          priority: 0.7,
          alternates: { languages },
        });
      }
    }
  } catch {
  }

  try {
    const posts = await prisma.post.findMany({
      where: { published: true },
      select: {
        id: true,
        slug: true,
        updatedAt: true,
        translations: { select: { locale: true, slug: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    for (const p of posts) {
      const languages = buildLocaleAlternatesForEntity(
        "/blog",
        p.slug,
        p.translations,
        p.id,
      );
      for (const locale of LOCALES) {
        entries.push({
          url: languages[locale],
          lastModified: p.updatedAt,
          changeFrequency: "monthly",
          priority: 0.65,
          alternates: { languages },
        });
      }
    }
  } catch {
  }

  return entries;
}
