import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { getTranslations } from "next-intl/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { buildPageMetadata } from "@/lib/seo";
import { slugFor } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import WaqfPage from "@/components/minbar/waqf/WaqfPage";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["waqf", "certificates", "zakat", "homepage", "quran"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "waqf" });
  return buildPageMetadata(locale, {
    title: t("qudsWaqfProjects"),
    description: t("meterIntro").slice(0, 165),
    path: `/${slugFor("waqf", locale)}`,
  });
}

/**
 * Al-Quds Waqf — ported from `Minbar/الأوقاف.dc.html`.
 *
 * A signed-in donor's name is passed through so the certificate fields offer a
 * one-tap fill rather than asking them to retype what the site already knows.
 */
export default async function Waqf({ params }: Props) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  const t = await getTranslations({ locale, namespace: "waqf" });

  const faqIds = ["q1", "q2", "q3", "q4", "q5"] as const;
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqIds.map((id) => ({
      "@type": "Question",
      name: t(`faq_${id}`),
      acceptedAnswer: { "@type": "Answer", text: t(`faqA_${id}`) },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <MinbarMessages locale={locale} namespaces={NAMESPACES}>
        <WaqfPage donorName={session?.user?.name ?? null} />
      </MinbarMessages>
    </>
  );
}
