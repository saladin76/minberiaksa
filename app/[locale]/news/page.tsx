import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";
import { slugFor } from "@/lib/minbar/routes";
import { listNews } from "@/lib/minbar/posts";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import NewsPage from "@/components/minbar/news/NewsPage";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["homepage"] as const;

/** News changes when an editor publishes, not per request. */
export const revalidate = 60;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  return buildPageMetadata(locale, {
    title: t("newsTitle"),
    description: t("newsLead").slice(0, 165),
    path: `/${slugFor("news", locale)}`,
  });
}

/**
 * The newsroom — ported from `Minbar/الأخبار.dc.html`.
 *
 * Its copy lives in the shell's `common` namespace, so only `homepage` is
 * added, for the three closing banners.
 */
export default async function News({ params }: Props) {
  const { locale } = await params;
  const items = await listNews(locale);

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <NewsPage items={items} />
    </MinbarMessages>
  );
}
