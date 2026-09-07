import type { Metadata } from "next";
import { LOCALE_SEO, buildPageMetadata } from "@/lib/seo";
import type { Locale } from "@/lib/seo";
import { listProjects, listSlides } from "@/lib/minbar/projects";
import { slugFor } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import ProjectsPage from "@/components/minbar/projects/ProjectsPage";
import type { ProjectSlide } from "@/components/minbar/projects/ProjectsHero";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["projects", "homepage", "quran"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const seo = LOCALE_SEO[locale as Locale] ?? LOCALE_SEO.en;
  return buildPageMetadata(locale, {
    title: seo.campaigns.title,
    description: seo.campaigns.description,
    path: `/${slugFor("projects", locale)}`,
    keywords: seo.keywords,
  });
}

/**
 * Projects catalogue — ported from `Minbar/المشاريع.dc.html`.
 *
 * Rendered on the server so the full project list is in the first response:
 * `PRODUCTION_SEO_CONTRACT.md` marks this page and its detail pages as
 * indexable, and a client-only fetch would leave the copy out of the index.
 */
export default async function Projects({ params }: Props) {
  const { locale } = await params;
  const [projects, curated] = await Promise.all([listProjects(locale), listSlides(locale)]);

  /* The carousel is the one the dashboard curates — an editor picks the
     images, the wording and where each slide leads. With none published it
     falls back to the highest-priority projects that have imagery: a slide
     with no photograph is a dark rectangle, which is worse than one slide
     fewer. */
  const slides: ProjectSlide[] = curated.length
    ? curated
        .filter((slide) => slide.image)
        .map((slide) => ({ title: slide.title, image: slide.image, href: slide.href || "#all" }))
    : projects
        .filter((p) => p.image)
        .slice(0, 4)
        .map((p) => ({ title: p.title, image: p.image, href: "#all" }));

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <ProjectsPage projects={projects} slides={slides} />
    </MinbarMessages>
  );
}
