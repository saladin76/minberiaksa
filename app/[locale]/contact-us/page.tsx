import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";
import { slugFor } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import ContactPage from "@/components/minbar/contact/ContactPage";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["contact", "homepage"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contact" });
  return buildPageMetadata(locale, {
    title: t("heroTitle"),
    description: t("heroSubtitle").slice(0, 165),
    path: `/${slugFor("contact", locale)}`,
  });
}

/**
 * Contact us — ported from `Minbar/تواصل معنا.dc.html`.
 *
 * `homepage` rides along for the three closing banners.
 */
export default async function Contact({ params }: Props) {
  const { locale } = await params;

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <ContactPage />
    </MinbarMessages>
  );
}
