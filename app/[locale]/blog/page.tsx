import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";
import { slugFor } from "@/lib/minbar/routes";
import { listArticles, listPostCategories } from "@/lib/minbar/posts";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import BlogPage from "@/components/minbar/blog/BlogPage";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["blog", "homepage"] as const;

/** Articles change when an editor publishes, not per request. */
export const revalidate = 60;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  const tSeo = await getTranslations({ locale, namespace: "about" });
  return buildPageMetadata(locale, {
    title: t("blogTitle"),
    description: tSeo("heroSubtitle").slice(0, 165),
    path: `/${slugFor("blog", locale)}`,
  });
}

/**
 * The blog — ported from `Minbar/المدونة.dc.html`, reading the real `Post` CMS
 * rather than the handoff's static `blog-articles-data.js`.
 *
 * The first page and the category chips are rendered on the server so the grid
 * is in the HTML; everything after that is fetched from `/api/minbar/posts`.
 */
export default async function Blog({ params }: Props) {
  const { locale } = await params;
  const [page, categories] = await Promise.all([
    listArticles({ locale }),
    listPostCategories(locale),
  ]);

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <BlogPage initialArticles={page.items} initialCursor={page.nextCursor} categories={categories} />
    </MinbarMessages>
  );
}
