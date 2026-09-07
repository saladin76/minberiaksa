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
  { id: "tracks", headingKey: "donTracksH", bodyKey: "donTracksP", icon: "route" },
  { id: "receipts", headingKey: "donReceiptsH", bodyKey: "donReceiptsP", icon: "receipt" },
  { id: "refunds", headingKey: "donRefundsH", bodyKey: "donRefundsP", icon: "wallet" },
  { id: "execution", headingKey: "donExecH", bodyKey: "donExecP", icon: "heart" },
];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return buildPageMetadata(locale, {
    title: t("donationTitle"),
    description: t("donTracksP").slice(0, 165),
    path: `/${slugFor("donationPolicy", locale)}`,
  });
}

/**
 * Ported from `Minbar/سياسة التبرع.dc.html`.
 *
 * `LEGAL_REVIEW_REQUIRED`: this text is under human legal review in every
 * language. A translation is not an approval.
 */
export default async function Page({ params }: Props) {
  const { locale } = await params;

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <LegalPage titleKey="donationTitle" sections={SECTIONS} />
    </MinbarMessages>
  );
}
