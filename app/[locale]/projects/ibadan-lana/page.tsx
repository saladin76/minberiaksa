import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";
import { messagesFor } from "@/i18n/locale-messages";
import { slugFor } from "@/lib/minbar/routes";
import { verseBlock } from "@/lib/minbar/quran";
import { listProjects } from "@/lib/minbar/projects";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import IbadanPage from "@/components/minbar/projects/IbadanPage";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["projects", "homepage", "quran"] as const;

/** Project figures change on donation, not per request. */
export const revalidate = 60;

/** Category slug the programme's projects are filed under. */
const REGION = "ibadan";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "projects" });
  return buildPageMetadata(locale, {
    title: t("ibadanHeroTitle"),
    description: t("ibadanHeroIntro").slice(0, 165),
    path: `/${slugFor("ibadanProject", locale)}`,
  });
}

/**
 * The ʿIbādan Lanā project — ported from `Minbar/مشروع عبادا لنا.dc.html`.
 *
 * Al-Isra 5 is the verse the project takes its name from, resolved on the
 * server so it is in the HTML rather than appearing after hydration.
 */
export default async function Ibadan({ params }: Props) {
  const { locale } = await params;

  const all = await listProjects(locale);
  const projects = all.filter((project) => project.region === REGION);

  const quran = messagesFor(locale).quran as Parameters<typeof verseBlock>[0];

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <IbadanPage projects={projects} verse={verseBlock(quran, "isra_5", locale)} />
    </MinbarMessages>
  );
}
