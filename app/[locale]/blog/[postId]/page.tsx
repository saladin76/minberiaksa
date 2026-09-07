import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildPageMetadata } from "@/lib/seo";
import { messagesFor } from "@/i18n/locale-messages";
import { slugFor } from "@/lib/minbar/routes";
import { getArticle } from "@/lib/minbar/posts";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import ArticleDetail from "@/components/minbar/blog/ArticleDetail";
import { ctaKeyFor } from "@/components/minbar/blog/ArticleCta";

interface Props {
  params: Promise<{ locale: string; postId: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["blog", "homepage"] as const;

/** Articles change when an editor publishes, not per request. */
export const revalidate = 60;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, postId } = await params;
  const article = await getArticle(decodeURIComponent(postId), locale);

  if (!article) {
    /* Read straight from the catalog rather than through `getTranslations`:
       this branch runs on the way to a 404, where Next has already left the
       `[locale]` segment and next-intl's server APIs throw. */
    const system = (messagesFor(locale).system ?? {}) as Record<string, string>;
    return {
      title: system.notFoundTitleFull,
      robots: { index: false, follow: false },
    };
  }

  return buildPageMetadata(locale, {
    title: article.title,
    description: article.excerpt.slice(0, 165),
    path: `/${slugFor("blog", locale)}/${encodeURIComponent(article.slug)}`,
    image: article.cover ?? undefined,
    type: "article",
  });
}

/**
 * One article — ported from `Minbar/تفاصيل المقال.dc.html`.
 *
 * The article resolves by locale slug, base slug, or id, so links minted before
 * an editor set a per-locale slug keep working. An unpublished or unknown
 * article is a real 404 rather than an empty article shell — a soft 404 is what
 * `PRODUCTION_SEO_CONTRACT.md` forbids.
 */
export default async function Article({ params }: Props) {
  const { locale, postId } = await params;
  const article = await getArticle(decodeURIComponent(postId), locale);
  if (!article) notFound();

  const ctaKey = ctaKeyFor(article.category?.slug, article.category?.name);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    datePublished: article.createdAt,
    ...(article.cover ? { image: article.cover } : {}),
    author: { "@type": "Organization", name: "Minbar Al Aqsa" },
    publisher: { "@type": "NGO", name: "Minbar Al Aqsa" },
  };

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger -- JSON-LD has no other insertion point
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ArticleDetail article={article} ctaKey={ctaKey} />
    </MinbarMessages>
  );
}
