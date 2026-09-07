import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";
import { messagesFor } from "@/i18n/locale-messages";
import { slugFor } from "@/lib/minbar/routes";
import { verseBlock } from "@/lib/minbar/quran";
import { listProjects } from "@/lib/minbar/projects";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import AqsaPage from "@/components/minbar/aqsa/AqsaPage";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["aqsa", "homepage", "quran"] as const;

/** Project figures change on donation, not per request. */
export const revalidate = 60;

/** Categories the design draws this page's project grid from. */
const REGIONS = ["al-aqsa", "al-quds"];

/** How many project cards the "our role" grid shows. */
const PROJECT_LIMIT = 8;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "aqsa" });
  return buildPageMetadata(locale, {
    title: t("pageTitle"),
    description: t("seoDescription").slice(0, 165),
    path: `/${slugFor("aqsa", locale)}`,
  });
}

/**
 * The blessed Al-Aqsa Mosque — ported from `Minbar/المسجد الأقصى.dc.html`.
 *
 * Both verses resolve on the server so they are in the HTML rather than
 * appearing after hydration: Al-Anbiya 71 above the page, and Al-Isra 1, which
 * is itself the first of the mosque's stated virtues.
 */
export default async function Aqsa({ params }: Props) {
  const { locale } = await params;

  const all = await listProjects(locale);
  const projects = all.filter((project) => project.region && REGIONS.includes(project.region)).slice(0, PROJECT_LIMIT);

  const quran = messagesFor(locale).quran as Parameters<typeof verseBlock>[0];

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <AqsaPage
        verse={verseBlock(quran, "anbiya_71", locale)}
        isra={verseBlock(quran, "isra_1", locale)}
        projects={projects}
      />
    </MinbarMessages>
  );
}
