import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";
import { slugFor } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import LegalPage, { type LegalSection } from "@/components/minbar/legal/LegalPage";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["legal"] as const;

const SECTIONS: readonly LegalSection[] = [
  { id: "usage", headingKey: "termsUsageH", bodyKey: "termsUsageP", icon: "document" },
  { id: "donations", headingKey: "termsDonationsH", bodyKey: "termsDonationsP", icon: "heart" },
  { id: "content", headingKey: "termsContentH", bodyKey: "termsContentP", icon: "file" },
  { id: "changes", headingKey: "termsChangesH", bodyKey: "termsChangesP", icon: "refresh" },
];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return buildPageMetadata(locale, {
    title: t("termsTitle"),
    description: t("termsUsageP").slice(0, 165),
    path: `/${slugFor("terms", locale)}`,
  });
}

/**
 * Ported from `Minbar/الشروط والأحكام.dc.html`.
 *
 * `LEGAL_REVIEW_REQUIRED`: this text is under human legal review in every
 * language. A translation is not an approval.
 */
export default async function Page({ params }: Props) {
  const { locale } = await params;

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <LegalPage titleKey="termsTitle" sections={SECTIONS} />
    </MinbarMessages>
  );
}
