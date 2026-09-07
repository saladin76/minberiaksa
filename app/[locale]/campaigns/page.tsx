import type { Metadata } from "next";
import { LOCALE_SEO, buildPageMetadata } from "@/lib/seo";
import type { Locale } from "@/lib/seo";
import CampaignsPageContent from "../_components/CampaignsPageContent";
import {
  getInitialCampaignsForPage,
  getCategoriesForPage,
} from "@/lib/server/public-data";

interface Props {
  params: Promise<{ locale: string }>;
}

export const revalidate = 60; // cache initial HTML for 60s

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const seo = LOCALE_SEO[locale as Locale] ?? LOCALE_SEO.en;
  return buildPageMetadata(locale, {
    title: seo.campaigns.title,
    description: seo.campaigns.description,
    path: "/campaigns",
    keywords: seo.keywords,
  });
}

export default async function CampaignsPage({ params }: Props) {
  const { locale } = await params;
  const [initial, categories] = await Promise.all([
    getInitialCampaignsForPage(locale),
    getCategoriesForPage(locale),
  ]);
  return (
    <CampaignsPageContent
      initialCampaigns={initial.items}
      initialCursor={initial.nextCursor}
      initialHasMore={initial.hasMore}
      initialTotal={initial.total}
      initialCategories={categories}
    />
  );
}
