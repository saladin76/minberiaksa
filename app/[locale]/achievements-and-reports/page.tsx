import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";
import { slugFor } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import ReportsPage from "@/components/minbar/reports/ReportsPage";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["achievements", "homepage"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "achievements" });
  return buildPageMetadata(locale, {
    title: t("reports.title"),
    description: t("hero.lead").slice(0, 165),
    path: `/${slugFor("reports", locale)}`,
  });
}

/**
 * Achievements and reports — ported from
 * `Minbar/إنجازات وتقارير المؤسسة.dc.html`.
 *
 * `homepage` rides along for the three closing banners.
 */
export default async function Achievements({ params }: Props) {
  const { locale } = await params;

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <ReportsPage />
    </MinbarMessages>
  );
}
