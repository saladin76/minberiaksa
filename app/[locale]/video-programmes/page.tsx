import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";
import { slugFor } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import ProgramsPage from "@/components/minbar/videos/ProgramsPage";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["homepage"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  return buildPageMetadata(locale, {
    title: t("programsTitle"),
    description: t("programsLead").slice(0, 165),
    path: `/${slugFor("programs", locale)}`,
  });
}

/** Our video programmes — ported from `Minbar/برامجنا المصورة.dc.html`. */
export default async function Programs({ params }: Props) {
  const { locale } = await params;

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <ProgramsPage />
    </MinbarMessages>
  );
}
