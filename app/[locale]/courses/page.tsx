import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";
import { slugFor } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import CoursesPage from "@/components/minbar/videos/CoursesPage";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["homepage"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "homepage" });
  return buildPageMetadata(locale, {
    title: t("coursesTitle"),
    description: t("coursesLead").slice(0, 165),
    path: `/${slugFor("courses", locale)}`,
  });
}

/** Our courses — ported from `Minbar/دوراتنا.dc.html`. */
export default async function Courses({ params }: Props) {
  const { locale } = await params;

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <CoursesPage />
    </MinbarMessages>
  );
}
