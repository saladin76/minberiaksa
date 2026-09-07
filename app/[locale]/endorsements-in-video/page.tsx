import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";
import { slugFor } from "@/lib/minbar/routes";
import { ENDORSEMENT_VIDEOS } from "@/lib/minbar/content/catalog";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import VideoGridPage from "@/components/minbar/videos/VideoGridPage";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["homepage"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "homepage" });
  return buildPageMetadata(locale, {
    title: t("endVideosPageTitle"),
    description: t("endVideosPageLead").slice(0, 165),
    path: `/${slugFor("endorsementVideos", locale)}`,
  });
}

/**
 * Our endorsements in video — testimonies from scholars, public figures,
 * supporters and field partners. Several are recorded for the Turkish edition
 * and are listed only there.
 *
 * Ported from `Minbar/تزكياتنا بالفيديو.dc.html`.
 */
export default async function Page({ params }: Props) {
  const { locale } = await params;

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <VideoGridPage videos={ENDORSEMENT_VIDEOS.items} titleKey="endVideosPageTitle" leadKey="endVideosPageLead" />
    </MinbarMessages>
  );
}
