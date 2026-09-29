import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE_URL, buildPageMetadata, clipSeoDescription } from "@/lib/seo";
import {
  getProject,
  getProjectDonorCount,
  getProjectSeo,
  listProjectComments,
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
const NAMESPACES = ["projects", "cart", "homepage", "quran", "ProjectExtras"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const key = decodeURIComponent(slug);

  /* A super category owns this slug ahead of any campaign  the programme
     pages live under /projects/<slug> and are rows, not files. */
  const superCategory = await getSuperCategory(key, locale);
  if (superCategory) {
    return buildPageMetadata(locale, {
      title: superCategory.metaTitle || superCategory.title,
      description: (superCategory.metaDescription || superCategory.intro || superCategory.subtitle),
      path: `/${slugFor("projectDetail", locale)}/${superCategory.slug}`,
      image: superCategory.heroImage || undefined,
    });
  }

  const project = await getProject(key, locale);
  // An unpublished or missing project must not produce indexable metadata 
  // `PRODUCTION_SEO_CONTRACT.md` requires a real 404, not a soft one.
  if (!project) return { title: "", robots: { index: false, follow: false } };

  /* What the admin set on the campaign's SEO page wins, for this language;
     then the localised title, description and cover. A campaign-level OG
     image is the last resort for the picture only  another language's title
     would be wrong here. */
  const seo = await getProjectSeo(project.id, locale);
  const title = seo.locale.seoTitle || project.title;
  const meta = buildPageMetadata(locale, {
    title,
    description: seo.locale.seoDescription || project.text,
    path: `/${slugFor("projectDetail", locale)}/${project.slug}`,
    image: seo.locale.ogImage || project.image || seo.campaign.ogImage || undefined,
    type: "article",
  });
  const ogTitle = seo.locale.ogTitle;
  const ogDescription = seo.locale.ogDescription ? clipSeoDescription(seo.locale.ogDescription, locale, 200) : null;
  if (ogTitle || ogDescription) {
    meta.openGraph = { ...meta.openGraph, ...(ogTitle ? { title: ogTitle } : {}), ...(ogDescription ? { description: ogDescription } : {}) };
    meta.twitter = { ...meta.twitter, ...(ogTitle ? { title: ogTitle } : {}), ...(ogDescription ? { description: ogDescription } : {}) };
  }
  return meta;
}

/**
 * Project detail  ported from `Minbar/تفاصيل مشروع.dc.html`.
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

  const [updates, related, donorCount, comments] = await Promise.all([
    listProjectUpdates(project.id, locale),
    listRelatedProjects(project, locale),
    getProjectDonorCount(project.id),
    listProjectComments(project.id),
  ]);

  /* The campaign's own photos first (the cover is already the hero), then
     the region's field photography to fill the tab. A campaign with neither
     has no Gallery tab. */
  const own = project.images.slice(1);
  const regional = project.region ? galleryFor(project.region, 6) : [];
  const gallery = [...new Set([...own, ...regional])].slice(0, Math.max(6, own.length));

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
        <ProjectDetail project={project} updates={updates} gallery={gallery} related={related} donorCount={donorCount} comments={comments} />
        <PageBanners locale={locale} page="projectDetail" slot="bottom" />
      </MinbarMessages>
    </>
  );
}
