import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";
import { messagesFor } from "@/i18n/locale-messages";
import { slugFor } from "@/lib/minbar/routes";
import { verseBlock } from "@/lib/minbar/quran";
import { listProjects } from "@/lib/minbar/projects";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import JerusalemPage from "@/components/minbar/jerusalem/JerusalemPage";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["jerusalem", "homepage", "quran"] as const;

/** Project figures change on donation, not per request. */
export const revalidate = 60;

/** Categories the design draws this page's project grid from. */
const REGIONS = ["al-quds", "al-aqsa"];

/** How many project cards the "our role" grid shows. */
const PROJECT_LIMIT = 8;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "jerusalem" });
  return buildPageMetadata(locale, {
    title: t("pageTitle"),
    description: t("seoDescription").slice(0, 165),
    path: `/${slugFor("jerusalem", locale)}`,
  });
}

/**
 * Al-Quds and the Old City — ported from
 * `Minbar/القدس والبلدة القديمة.dc.html`.
 *
 * The project grid is the live catalogue filtered to the two categories the
 * design names, not the handoff's static `projects-data.js`. A category with
 * nothing published simply contributes nothing, and the section hides rather
 * than showing an empty grid.
 */
export default async function Jerusalem({ params }: Props) {
  const { locale } = await params;

  const all = await listProjects(locale);
  const projects = all.filter((project) => project.region && REGIONS.includes(project.region)).slice(0, PROJECT_LIMIT);

  /* Al-Anbiya 71 — "the land We had blessed for the worlds". Resolved on the
     server so the verse is in the HTML rather than appearing after hydration. */
  const quran = messagesFor(locale).quran as Parameters<typeof verseBlock>[0];
  const verse = verseBlock(quran, "anbiya_71", locale);

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <JerusalemPage verse={verse} projects={projects} />
    </MinbarMessages>
  );
}
