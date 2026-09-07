import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";
import { slugFor } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import PublicationsPage from "@/components/minbar/publications/PublicationsPage";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = [] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  return buildPageMetadata(locale, {
    title: t("bookletsTitle"),
    description: t("bookletsLead").slice(0, 165),
    path: `/${slugFor("publications", locale)}`,
  });
}

/**
 * Our publications — ported from `Minbar/كتيبات المؤسسة.dc.html`.
 *
 * Every string it needs is in `common`, which the shell bundle already carries,
 * so this page adds no namespaces of its own.
 */
export default async function Publications({ params }: Props) {
  const { locale } = await params;

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <PublicationsPage />
    </MinbarMessages>
  );
}
