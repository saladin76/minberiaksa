import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";
import { slugFor } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import AboutPage from "@/components/minbar/about/AboutPage";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["about", "homepage"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
  return buildPageMetadata(locale, {
    title: t("heroTitle"),
    description: t("heroSubtitle").slice(0, 165),
    path: `/${slugFor("about", locale)}`,
  });
}

/**
 * About us — ported from `Minbar/من نحن.dc.html`.
 *
 * `homepage` rides along for the three closing banners, which the handoff
 * places at the foot of this page as it does on projects and the home page.
 */
export default async function About({ params }: Props) {
  const { locale } = await params;

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <AboutPage />
    </MinbarMessages>
  );
}
