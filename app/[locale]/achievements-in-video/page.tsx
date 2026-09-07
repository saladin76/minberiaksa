import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";
import { slugFor } from "@/lib/minbar/routes";
import { ACHIEVEMENT_VIDEOS } from "@/lib/minbar/content/catalog";
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
    title: t("achVideosPageTitle"),
    description: t("achVideosPageLead").slice(0, 165),
    path: `/${slugFor("achievementVideos", locale)}`,
  });
}

/**
 * Our achievements in video — filmed documentation from the field of the
 * projects in Al-Quds, Gaza and Al-Aqsa Mosque.
 *
 * Ported from `Minbar/إنجازاتنا بالفيديو.dc.html`.
 */
export default async function Page({ params }: Props) {
  const { locale } = await params;

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <VideoGridPage videos={ACHIEVEMENT_VIDEOS.items} titleKey="achVideosPageTitle" leadKey="achVideosPageLead" />
    </MinbarMessages>
  );
}
