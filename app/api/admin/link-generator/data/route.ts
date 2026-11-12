import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { routing } from "@/i18n/routing.config";
import { URL_CURRENCY_CODES_ORDERED } from "@/lib/currency-link";
import { pickLocaleSlug } from "@/lib/slug";

function nonEmpty(s: string | null | undefined) {
  return typeof s === "string" && s.trim().length > 0;
}

/**
 * Build a Record<locale, slug> for an entity. Locale entries are populated only when
 * either a per-locale translation slug exists or the base slug exists; otherwise we
 * leave the locale out so the link-generator UI knows to fall back to the entity ID.
 */
function buildSlugByLocale(
  baseSlug: string | null,
  translations: Array<{ locale: string; slug?: string | null }>,
  supportedLocales: string[]
): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  for (const loc of supportedLocales) {
    // Use precisely the same locale fallback order as the public page resolver.
    // Arabic uses the base slug, other languages may fall back to English.
    map[loc] = pickLocaleSlug(baseSlug, translations, loc);
  }
  return map;
}

/** Show real translated names in the destination picker while preserving
 * stable IDs and locale-specific slugs in generated links. */
function buildTitleByLocale(
  base: string,
  translations: Array<{ locale: string; title?: string | null; name?: string | null }>,
  locales: string[],
): Record<string, string> {
  return Object.fromEntries(locales.map(locale => {
    const translation = translations.find(row => row.locale === locale);
    return [locale, translation?.title || translation?.name || base];
  }));
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "referrals");
    if (denied) return denied;

    const [campaigns, categories, superCategories, posts, postCategories] = await Promise.all([
      prisma.campaign.findMany({
        select: {
          id: true,
          slug: true,
          title: true,
          translations: { select: { locale: true, title: true, slug: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 8000,
      }),
      prisma.category.findMany({
        select: {
          id: true,
          slug: true,
          name: true,
          translations: { select: { locale: true, name: true, slug: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.superCategory.findMany({
        where: { isActive: true },
        select: {
          id: true,
          slug: true,
          title: true,
          translations: { select: { locale: true, title: true, slug: true } },
        },
        orderBy: { order: "asc" },
      }),
      prisma.post.findMany({
        select: {
          id: true,
          slug: true,
          title: true,
          published: true,
          translations: { select: { locale: true, title: true, slug: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 3000,
      }),
      prisma.postCategory.findMany({
        select: {
          id: true,
          slug: true,
          name: true,
          translations: { select: { locale: true, name: true, slug: true } },
        },
        orderBy: { name: "asc" },
      }),
    ]);

    const campaignRows = campaigns.map((c) => {
      const supportedLocales = new Set<string>();
      if (nonEmpty(c.title)) supportedLocales.add("ar");
      for (const t of c.translations) {
        if (nonEmpty(t.title)) supportedLocales.add(t.locale);
      }
      const localesArr = [...supportedLocales];
      return {
        id: c.id,
        slug: c.slug ?? null,
        title: c.title,
        titleByLocale: buildTitleByLocale(c.title, c.translations, localesArr),
        supportedLocales: localesArr,
        slugByLocale: buildSlugByLocale(c.slug ?? null, c.translations, localesArr),
      };
    });

    const categoryRows = categories.map((c) => {
      const supportedLocales = new Set<string>();
      if (nonEmpty(c.name)) supportedLocales.add("ar");
      for (const t of c.translations) {
        if (nonEmpty(t.name)) supportedLocales.add(t.locale);
      }
      const localesArr = [...supportedLocales];
      return {
        id: c.id,
        slug: c.slug ?? null,
        name: c.name,
        titleByLocale: buildTitleByLocale(c.name, c.translations, localesArr),
        supportedLocales: localesArr,
        slugByLocale: buildSlugByLocale(c.slug ?? null, c.translations, localesArr),
      };
    });

    const superCategoryRows = superCategories.map((row) => {
      const supportedLocales = new Set<string>();
      if (nonEmpty(row.title)) supportedLocales.add("ar");
      for (const translation of row.translations) {
        if (nonEmpty(translation.title)) supportedLocales.add(translation.locale);
      }
      const localesArr = [...supportedLocales];
      return {
        id: row.id,
        slug: row.slug ?? null,
        title: row.title,
        titleByLocale: buildTitleByLocale(row.title, row.translations, localesArr),
        published: true,
        supportedLocales: localesArr,
        slugByLocale: buildSlugByLocale(row.slug ?? null, row.translations, localesArr),
      };
    });

    const postRows = posts.map((p) => {
      const supportedLocales = new Set<string>();
      if (nonEmpty(p.title)) supportedLocales.add("ar");
      for (const t of p.translations) {
        if (nonEmpty(t.title)) supportedLocales.add(t.locale);
      }
      const localesArr = [...supportedLocales];
      return {
        id: p.id,
        slug: p.slug ?? null,
        title: p.title || "—",
        titleByLocale: buildTitleByLocale(p.title || "—", p.translations, localesArr),
        published: p.published,
        supportedLocales: localesArr,
        slugByLocale: buildSlugByLocale(p.slug ?? null, p.translations, localesArr),
      };
    });

    const postCategoryRows = postCategories.map((c) => {
      const supportedLocales = new Set<string>();
      if (nonEmpty(c.name)) supportedLocales.add("ar");
      for (const t of c.translations) {
        if (nonEmpty(t.name)) supportedLocales.add(t.locale);
      }
      const localesArr = [...supportedLocales];
      return {
        id: c.id,
        slug: c.slug ?? null,
        name: c.name,
        titleByLocale: buildTitleByLocale(c.name, c.translations, localesArr),
        supportedLocales: localesArr,
        slugByLocale: buildSlugByLocale(c.slug ?? null, c.translations, localesArr),
      };
    });

    return NextResponse.json({
      locales: [...routing.locales],
      currencies: [...URL_CURRENCY_CODES_ORDERED],
      campaigns: campaignRows,
      categories: categoryRows,
      superCategories: superCategoryRows,
      posts: postRows,
      postCategories: postCategoryRows,
    });
  } catch (e) {
    console.error("link-generator data", e);
    return NextResponse.json({ error: "Failed to load link data" }, { status: 500 });
  }
}
