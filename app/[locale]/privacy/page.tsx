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
  { id: "collect", headingKey: "privCollectH", bodyKey: "privCollectP", icon: "database" },
  { id: "use", headingKey: "privUseH", bodyKey: "privUseP", icon: "sliders" },
  { id: "cookies", headingKey: "privCookiesH", bodyKey: "privCookiesP", icon: "cookie" },
  { id: "security", headingKey: "privSecurityH", bodyKey: "privSecurityP", icon: "shield" },
  { id: "rights", headingKey: "privRightsH", bodyKey: "privRightsP", icon: "accessibility" },
  { id: "contact", headingKey: "privContactH", bodyKey: "privContactP", icon: "mail" },
];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return buildPageMetadata(locale, {
    title: t("privacyTitle"),
    description: t("privCollectP").slice(0, 165),
    path: `/${slugFor("privacy", locale)}`,
  });
}

/**
 * Ported from `Minbar/سياسة الخصوصية.dc.html`.
 *
 * `LEGAL_REVIEW_REQUIRED`: this text is under human legal review in every
 * language. A translation is not an approval.
 */
export default async function Page({ params }: Props) {
  const { locale } = await params;

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <LegalPage titleKey="privacyTitle" sections={SECTIONS} />
    </MinbarMessages>
  );
}
