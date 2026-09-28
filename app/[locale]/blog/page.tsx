import type { Metadata } from "next";
import { LOCALE_SEO, buildPageMetadata, type Locale } from "@/lib/seo";
import { slugFor } from "@/lib/minbar/routes";
import { listArticles, listPostCategories } from "@/lib/minbar/posts";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import BlogPage from "@/components/minbar/blog/BlogPage";
import PageBanners from "@/components/minbar/banners/PageBanners";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["blog", "homepage"] as const;

/** Articles change when an editor publishes, not per request. */
export const revalidate = 60;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  /* The blog's own SEO copy, per locale. This used to borrow the ABOUT page's hero subtitle, so every
     language's blog listing was described to search engines as the organisation rather than as its
     articles. `LOCALE_SEO[locale].blog` is the generated source that exists for exactly this. */
  const seo = LOCALE_SEO[locale as Locale] ?? LOCALE_SEO.en;
  return buildPageMetadata(locale, {
    title: seo.blog.title,
    description: seo.blog.description,
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
        <PageBanners locale={locale} page="blog" slot="top" />
      <BlogPage initialArticles={page.items} initialCursor={page.nextCursor} categories={categories} />
      <PageBanners locale={locale} page="blog" slot="bottom" />
    </MinbarMessages>
  );
}
