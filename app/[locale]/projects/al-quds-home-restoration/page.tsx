import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";
import { slugFor } from "@/lib/minbar/routes";
import { listProjects } from "@/lib/minbar/projects";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import RestorationPage from "@/components/minbar/projects/RestorationPage";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["projects"] as const;

/** Project figures change on donation, not per request. */
export const revalidate = 60;

/**
 * Homes restored and the programme's target, as the foundation publishes them.
 * Carried from `Minbar/مشروع ترميم منازل القدس.dc.html`, which prints them
 * beside the reviewed `restStatHomes` / `restStatGoal` labels. Replaced only by
 * newer published figures — the same rule the impact report's totals carry.
 */
const HOMES_RESTORED = 45;
const HOMES_GOAL = 100;

/** Category slugs a restoration campaign is filed under. */
const REGIONS = ["repair", "al-quds"];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "projects" });
  return buildPageMetadata(locale, {
    title: t("restHeroTitle"),
    description: t("restHeroLead").slice(0, 165),
    path: `/${slugFor("restorationProject", locale)}`,
  });
}

/**
 * Restoring the homes of Al-Quds — ported from
 * `Minbar/مشروع ترميم منازل القدس.dc.html`.
 *
 * The homes open for support come from the live catalogue rather than the
 * handoff's illustrative grid, which its own comment marks as standing in until
 * official figures arrive.
 */
export default async function Restoration({ params }: Props) {
  const { locale } = await params;

  const all = await listProjects(locale);
  const projects = all.filter((project) => project.region && REGIONS.includes(project.region)).slice(0, 6);

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <RestorationPage projects={projects} restored={HOMES_RESTORED} goal={HOMES_GOAL} />
    </MinbarMessages>
  );
}
