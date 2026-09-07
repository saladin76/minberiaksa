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
  { id: "commitment", headingKey: "a11yCommitH", bodyKey: "a11yCommitP", icon: "accessibility" },
  { id: "measures", headingKey: "a11yMeasuresH", bodyKey: "a11yMeasuresP", icon: "sliders" },
  { id: "feedback", headingKey: "a11yFeedbackH", bodyKey: "a11yFeedbackP", icon: "mail" },
];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return buildPageMetadata(locale, {
    title: t("a11yTitle"),
    description: t("a11yCommitP").slice(0, 165),
    path: `/${slugFor("accessibility", locale)}`,
  });
}

/**
 * Ported from `Minbar/بيان إمكانية الوصول.dc.html`.
 *
 * `LEGAL_REVIEW_REQUIRED`: this text is under human legal review in every
 * language. A translation is not an approval.
 */
export default async function Page({ params }: Props) {
  const { locale } = await params;

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <LegalPage titleKey="a11yTitle" sections={SECTIONS} />
    </MinbarMessages>
  );
}
