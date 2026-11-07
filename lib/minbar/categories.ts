import { categoryProjectCounts } from "@/lib/campaign/category-project-counts";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import { CATEGORY_ACTIVE_OR_UNSET } from "@/lib/campaign/soft-delete-filter";

/**
 * Server-side reader for the public category index  the header's projects
 * menu, the homepage's categories section and the footer's categories band.
 *
 * Text arrives already resolved for the visitor's locale (Arabic from the row,
 * anything else from the translation with English as the fallback), and `href`
 * is the category's own landing page under its per-locale slug. A category
 * bound to one of the site's pages (`pageTemplate`) keeps the same link:
 * `/category/{slug}` redirects there.
 *
 * The header and footer read this on every page, so it is cached across
 * requests. A dashboard edit shows up within `REVALIDATE_SECONDS`.
 */

export interface MinbarCategory {
  navigationVisible?: boolean;
  id: string;
  slug: string;
  href: string;
  name: string;
  description: string;
  image: string;
  /** Whatever the dashboard's icon picker stored  render with `CategoryIcon`. */
  icon: string;
  /** Published, non-deleted campaigns filed under this category. */
  projectCount: number;
  order?: number | null;
}

/** The slice the header and footer need, kept small because it ships on every page. */
export type NavCategory = Pick<MinbarCategory, "id" | "href" | "name" | "image" | "projectCount">;

const REVALIDATE_SECONDS = 300;

async function readCategories(locale: string): Promise<MinbarCategory[]> {
  const rows = await prisma.category.findMany({
    where: CATEGORY_ACTIVE_OR_UNSET,
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      image: true,
      heroImage: true,
      icon: true,
      order: true,
      navigationVisible: true,
      translations: {
        where: translationLocaleWhere(locale),
        take: 2,
        select: { locale: true, name: true, slug: true, description: true },
      },
    },
  });

  /* Editor order first; rows without one follow, by name. Sorted here because
     Mongo puts unset `order` values first. */
  rows.sort((a, b) => {
    const ao = a.order ?? Number.POSITIVE_INFINITY;
    const bo = b.order ?? Number.POSITIVE_INFINITY;
    return ao !== bo ? ao - bo : a.name.localeCompare(b.name);
  });

  const counts = await categoryProjectCounts(prisma, rows.map(row => row.id));
  return rows.map((row) => {
    const t = pickTranslation(row.translations, locale);
    const slug = t?.slug || row.slug || row.id;
    return {
      id: row.id,
      navigationVisible: row.navigationVisible !== false,
      slug,
      href: `/${locale}/category/${encodeURIComponent(slug)}`,
      name: t?.name || row.name,
      description: t?.description || row.description || "",
      image: row.image || row.heroImage || "",
      icon: row.icon ?? "",
      projectCount: counts.get(row.id)?.published ?? 0,
      order: row.order,
    };
  });
}

const cachedCategories = unstable_cache(readCategories, ["minbar-categories"], {
  revalidate: REVALIDATE_SECONDS,
  tags: ["minbar-categories"],
});

/** Every active category, in the editor's order. Never throws  an empty list hides the menus. */
export async function listCategories(locale: string): Promise<MinbarCategory[]> {
  try {
    return await cachedCategories(locale);
  } catch (err) {
    console.error("listCategories failed:", err);
    return [];
  }
}
