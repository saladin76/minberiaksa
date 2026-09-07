import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";
import { slugFor } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import ZakatPage from "@/components/minbar/zakat/ZakatPage";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["zakat", "homepage", "quran"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "zakat" });
  return buildPageMetadata(locale, {
    title: t("heroTitle"),
    description: t("whyText").slice(0, 165),
    path: `/${slugFor("zakat", locale)}`,
  });
}

/**
 * Zakat — ported from `Minbar/الزكاة.dc.html`.
 *
 * `PRODUCTION_SEO_CONTRACT.md` allows `FAQPage` structured data only where real
 * questions are actually displayed. They are here, so it is emitted; the answers
 * are the reviewed ones from the translated `zakat` bundle.
 */
export default async function Zakat({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "zakat" });

  const faqIds = ["hawl", "metal", "salary", "jewelry", "early", "channels"] as const;
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqIds.map((id) => ({
      "@type": "Question",
      name: t(`faq_${id}_q`),
      acceptedAnswer: { "@type": "Answer", text: t(`faq_${id}_a`) },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <MinbarMessages locale={locale} namespaces={NAMESPACES}>
        <ZakatPage />
      </MinbarMessages>
    </>
  );
}
