import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";
import { slugFor } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import VolunteerPage from "@/components/minbar/volunteer/VolunteerPage";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["volunteer", "contact", "partner", "homepage"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "volunteer" });
  return buildPageMetadata(locale, {
    title: t("heroTitle"),
    description: t("heroSubtitle").slice(0, 165),
    path: `/${slugFor("volunteer", locale)}`,
  });
}

/**
 * Volunteer with us — ported from `Minbar/تطوع معنا.dc.html`.
 *
 * The form borrows its field labels from `contact` and its send button from
 * `partner` rather than duplicating strings that are already reviewed in 19
 * languages; `homepage` rides along for the three closing banners.
 */
export default async function Volunteer({ params }: Props) {
  const { locale } = await params;

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <VolunteerPage />
    </MinbarMessages>
  );
}
