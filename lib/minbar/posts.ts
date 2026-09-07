import { prisma } from "@/lib/prisma";
import { pickLocaleSlug, whereByIdOrAnyLocaleSlug } from "@/lib/slug";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";

/**
 * The blog's data layer.
 *
 * `Minbar/المدونة.dc.html` and `Minbar/تفاصيل المقال.dc.html` read a static
 * `blog-articles-data.js` of 178 demo articles. The site has a real CMS behind
 * `Post` / `PostCategory`, so these read from it: an article published in the
 * dashboard appears on the blog, and one unpublished disappears.
 *
 * The category chips likewise come from `PostCategory`, not the handoff's
 * hard-coded Arabic list — a category added in the dashboard becomes a filter
 * without a code change, and one with no published articles never shows up as a
 * chip that returns nothing.
 */

/** How many cards a page of the blog shows before "show more". */
export const ARTICLES_PER_PAGE = 12;

export interface MinbarArticle {
  id: string;
  /** Locale slug when the translation has one, else the base slug, else the id. */
  slug: string;
  title: string;
  /** Short lead shown on the card. May be empty. */
  excerpt: string;
  /** Cover image URL, or `null` when the article has none. */
  cover: string | null;
  /** ISO timestamp of publication. */
  createdAt: string;
  category: { id: string; slug: string | null; name: string } | null;
}

export interface MinbarArticleDetail extends MinbarArticle {
  /** Raw article body from the CMS. Rendered as blocks by the detail page. */
  content: string;
  /** Ids of the campaigns the editor attached to this article. */
  campaignIds: string[];
}

export interface MinbarPostCategory {
  id: string;
  slug: string | null;
  name: string;
}

/** The `select` both listing paths share, so a card is built the same way. */
const CARD_SELECT = (locale: string) =>
  ({
    id: true,
    slug: true,
    title: true,
    description: true,
    image: true,
    createdAt: true,
    category: {
      select: {
        id: true,
        slug: true,
        name: true,
        translations: {
          where: translationLocaleWhere(locale),
          take: 2,
          select: { locale: true, name: true, slug: true },
        },
      },
    },
    translations: {
      where: translationLocaleWhere(locale),
      take: 2,
      select: { locale: true, title: true, description: true, image: true, slug: true },
    },
  }) as const;

type CardRow = {
  id: string;
  slug: string | null;
  title: string | null;
  description: string | null;
  image: string | null;
  createdAt: Date;
  category: {
    id: string;
    slug: string | null;
    name: string;
    translations: Array<{ locale: string; name: string; slug: string | null }>;
  } | null;
  translations: Array<{
    locale: string;
    title: string | null;
    description: string | null;
    image: string | null;
    slug: string | null;
  }>;
};

function toArticle(row: CardRow, locale: string): MinbarArticle {
  const t = pickTranslation(row.translations, locale);
  const categoryTranslation = row.category ? pickTranslation(row.category.translations, locale) : undefined;

  return {
    id: row.id,
    /* The id is the last resort so a card is never a dead link: the detail
       route resolves an id as readily as a slug. */
    slug: pickLocaleSlug(row.slug, row.translations, locale) ?? row.id,
    title: t?.title || row.title || "",
    excerpt: t?.description || row.description || "",
    cover: t?.image || row.image || null,
    createdAt: row.createdAt.toISOString(),
    category: row.category
      ? {
          id: row.category.id,
          slug: categoryTranslation?.slug || row.category.slug || null,
          name: categoryTranslation?.name || row.category.name,
        }
      : null,
  };
}

export interface ListArticlesOptions {
  locale: string;
  /** Restrict to one category id. Omit for every category. */
  categoryId?: string | null;
  /** Id of the last article already shown, for the next page. */
  cursor?: string | null;
  take?: number;
}

/**
 * One page of published articles, newest first. Returns `nextCursor` when more
 * remain, which is what the "show more" button sends back.
 */
export async function listArticles({
  locale,
  categoryId = null,
  cursor = null,
  take = ARTICLES_PER_PAGE,
}: ListArticlesOptions): Promise<{ items: MinbarArticle[]; nextCursor: string | null }> {
  try {
    const rows = (await prisma.post.findMany({
      where: { published: true, ...(categoryId ? { categoryId } : {}) },
      take: take + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: "desc" },
      select: CARD_SELECT(locale),
    })) as CardRow[];

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;

    return {
      items: items.map((row) => toArticle(row, locale)),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  } catch (err) {
    /* A blog that cannot reach the database renders as an empty blog rather
       than as a 500 — the rest of the page still offers a way to donate. */
    console.error("listArticles failed:", err);
    return { items: [], nextCursor: null };
  }
}

/** One article by locale slug, base slug, or id. `null` when unpublished. */
export async function getArticle(slugOrId: string, locale: string): Promise<MinbarArticleDetail | null> {
  try {
    const row = (await prisma.post.findFirst({
      where: { published: true, ...whereByIdOrAnyLocaleSlug(slugOrId) },
      select: { ...CARD_SELECT(locale), content: true, campaignIds: true },
    })) as (CardRow & { content: string | null; campaignIds: string[] }) | null;

    if (!row) return null;

    const t = pickTranslation(row.translations, locale) as { content?: string | null } | undefined;
    return {
      ...toArticle(row, locale),
      content: t?.content || row.content || "",
      campaignIds: row.campaignIds ?? [],
    };
  } catch (err) {
    console.error("getArticle failed:", err);
    return null;
  }
}

/**
 * The categories that have at least one published article, in the order the
 * dashboard lists them. A category with nothing published is left out: a chip
 * that filters to an empty grid is worse than no chip.
 */
export async function listPostCategories(locale: string): Promise<MinbarPostCategory[]> {
  try {
    const rows = await prisma.postCategory.findMany({
      where: { posts: { some: { published: true } } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        translations: {
          where: translationLocaleWhere(locale),
          take: 2,
          select: { locale: true, name: true, slug: true },
        },
      },
    });

    return rows.map((row) => {
      const t = pickTranslation(row.translations, locale);
      return { id: row.id, slug: t?.slug || row.slug || null, name: t?.name || row.name };
    });
  } catch (err) {
    console.error("listPostCategories failed:", err);
    return [];
  }
}

/**
 * Up to `take` other published articles from the same category, for the foot of
 * an article. Falls back to the newest articles when the piece has no category.
 */
export async function listRelatedArticles(
  article: MinbarArticle,
  locale: string,
  take = 3
): Promise<MinbarArticle[]> {
  try {
    const rows = (await prisma.post.findMany({
      where: {
        published: true,
        id: { not: article.id },
        ...(article.category ? { categoryId: article.category.id } : {}),
      },
      take,
      orderBy: { createdAt: "desc" },
      select: CARD_SELECT(locale),
    })) as CardRow[];

    return rows.map((row) => toArticle(row, locale));
  } catch (err) {
    console.error("listRelatedArticles failed:", err);
    return [];
  }
}

/**
 * Category slugs that identify the newsroom. The dashboard names its categories
 * freely, so several reasonable spellings are accepted rather than one.
 */
const NEWS_SLUGS = ["news", "akhbar", "الأخبار", "اخبار"];

/**
 * The newsroom feed — the newest published posts filed under a news category.
 *
 * `Minbar/الأخبار.dc.html` ships four placeholder items with an em dash for a
 * date and dead `#news-1` links. The real newsroom is editorial content the
 * dashboard owns, so this reads the CMS: an editor files a post under a
 * category slugged `news` and it appears here, dated, linking to the same
 * article page the blog links to.
 *
 * With no such category the list is empty and the page says so. Showing the
 * blog's posts here instead would put the same articles on two URLs.
 */
export async function listNews(locale: string, take = ARTICLES_PER_PAGE): Promise<MinbarArticle[]> {
  try {
    const category = await prisma.postCategory.findFirst({
      where: { OR: [{ slug: { in: NEWS_SLUGS } }, { name: { in: NEWS_SLUGS } }] },
      select: { id: true },
    });
    if (!category) return [];

    const page = await listArticles({ locale, categoryId: category.id, take });
    return page.items;
  } catch (err) {
    console.error("listNews failed:", err);
    return [];
  }
}
