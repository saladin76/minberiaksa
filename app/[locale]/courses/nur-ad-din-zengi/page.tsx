import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";
import { slugFor } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import ZenkiPage from "@/components/minbar/courses/ZenkiPage";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["zenki", "homepage"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "zenki" });
  return buildPageMetadata(locale, {
    title: t("heroTitle"),
    description: t("heroLead").slice(0, 165),
    path: `/${slugFor("zenkiCourse", locale)}`,
  });
}

/**
 * The Nur ad-Din Zangi course — ported from
 * `Minbar/دورة نور الدين زنكي.dc.html`.
 *
 * The only course with a page of its own. Its syllabus is Arabic source
 * content and is not translated — see `lib/minbar/content/zenki.ts` for why.
 */
export default async function Zenki({ params }: Props) {
  const { locale } = await params;

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <ZenkiPage />
    </MinbarMessages>
  );
}
