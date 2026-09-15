import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE_URL, buildPageMetadata } from "@/lib/seo";
import {
  getProject,
  listProjectUpdates,
  listRelatedProjects,
} from "@/lib/minbar/projects";
import { galleryFor } from "@/lib/minbar/content/media";
import { miaPath, slugFor } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import ProjectDetail from "@/components/minbar/projects/ProjectDetail";
import SuperCategoryPage from "@/components/minbar/projects/SuperCategoryPage";
import { getSuperCategory } from "@/lib/minbar/super-category";
import PageBanners from "@/components/minbar/banners/PageBanners";

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["projects", "cart", "homepage", "quran"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const key = decodeURIComponent(slug);

  /* A super category owns this slug ahead of any campaign — the programme
     pages live under /projects/<slug> and are rows, not files. */
  const superCategory = await getSuperCategory(key, locale);
  if (superCategory) {
    return buildPageMetadata(locale, {
      title: superCategory.metaTitle || superCategory.title,
      description: (superCategory.metaDescription || superCategory.intro || superCategory.subtitle).slice(0, 165),
      path: `/${slugFor("projectDetail", locale)}/${superCategory.slug}`,
      image: superCategory.heroImage || undefined,
    });
  }

  const project = await getProject(key, locale);
  // An unpublished or missing project must not produce indexable metadata —
  // `PRODUCTION_SEO_CONTRACT.md` requires a real 404, not a soft one.
  if (!project) return { title: "", robots: { index: false, follow: false } };

  return buildPageMetadata(locale, {
    title: project.title,
    description: project.text.slice(0, 165),
    path: `/${slugFor("projectDetail", locale)}/${project.slug}`,
    image: project.image ?? undefined,
    type: "article",
  });
}

/**
 * Project detail — ported from `Minbar/تفاصيل مشروع.dc.html`.
 *
 * Everything is read on the server: this page is indexable, and its copy,
 * figures and breadcrumb all have to be in the first response.
 */
export default async function ProjectPage({ params }: Props) {
  const { locale, slug } = await params;
  const key = decodeURIComponent(slug);

  const superCategory = await getSuperCategory(key, locale);
  if (superCategory) {
    return (
      <MinbarMessages locale={locale} namespaces={NAMESPACES}>
        <PageBanners locale={locale} page="projectDetail" slot="top" />
        <SuperCategoryPage page={superCategory} />
        <PageBanners locale={locale} page="projectDetail" slot="bottom" />
      </MinbarMessages>
    );
  }

  const project = await getProject(key, locale);
  if (!project) notFound();

  const [updates, related] = await Promise.all([
    listProjectUpdates(project.id, locale),
    listRelatedProjects(project, locale),
  ]);

  // Field photography is per-region; a region with no genuine bank returns an
  // empty list and the Gallery tab simply does not appear.
  const gallery = project.region ? galleryFor(project.region, 6) : [];

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}${miaPath("home", locale)}` },
      { "@type": "ListItem", position: 2, name: "Projects", item: `${SITE_URL}${miaPath("projects", locale)}` },
      { "@type": "ListItem", position: 3, name: project.title, item: `${SITE_URL}${miaPath("projectDetail", locale, project.slug)}` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <MinbarMessages locale={locale} namespaces={NAMESPACES}>
        <PageBanners locale={locale} page="projectDetail" slot="top" />
        <ProjectDetail project={project} updates={updates} gallery={gallery} related={related} />
        <PageBanners locale={locale} page="projectDetail" slot="bottom" />
      </MinbarMessages>
    </>
  );
}
