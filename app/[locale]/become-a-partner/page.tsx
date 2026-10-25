import { buildManagedPageMetadata } from "@/lib/content-editor/page-seo";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { slugFor } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import PartnerPage from "@/components/minbar/partner/PartnerPage";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["partner"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "partner" });
  return buildManagedPageMetadata("partner", locale, {
    title: t("heroTitle"),
    description: t("metaDescription"),
    path: `/${slugFor("partner", locale)}`,
  });
}

/** Become a partner  ported from `Minbar/كن شريكا.dc.html`. */
export default async function Partner({ params }: Props) {
  const { locale } = await params;

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <PartnerPage />
    </MinbarMessages>
  );
}
