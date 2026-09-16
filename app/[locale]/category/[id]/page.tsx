import React from "react";
import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isObjectId, pickLocaleSlug, whereByIdOrAnyLocaleSlug } from "@/lib/slug";
import { pickTranslation } from "@/lib/i18n/translation-fallback";
import {
  LOCALE_SEO,
  OG_LOCALE_MAP,
  SITE_URL,
  buildLocalizedAlternates,
} from "@/lib/seo";
import type { Locale } from "@/lib/seo";
import { getCategoryPage } from "@/lib/minbar/category-page";
import { pageTemplate, type CategoryPageTemplate } from "@/lib/content/category-page-write";
import { miaPath, type MinbarRoute } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import CategoryLandingPage from "@/components/minbar/categories/CategoryLandingPage";
import PageBanners from "@/components/minbar/banners/PageBanners";

interface Props {
  params: Promise<{ id: string; locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["CampaignsPage", "homepage", "projects", "cart"] as const;

/** Campaign figures change on donation, not per request. */
export const revalidate = 60;

/** Where each bound category is published. */
const TEMPLATE_ROUTES: Record<CategoryPageTemplate, MinbarRoute> = { aqsa: "aqsa", zakat: "zakat" };

async function fetchCategoryForSeo(idOrSlug: string) {
  return prisma.category.findFirst({
    where: whereByIdOrAnyLocaleSlug(idOrSlug),
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      image: true,
      heroImage: true,
      heroLead: true,
      translations: {
        select: { locale: true, name: true, description: true, slug: true, heroLead: true },
      },
    },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, locale } = await params;
  const seo = LOCALE_SEO[locale as Locale] ?? LOCALE_SEO.en;
  // Always anchor canonical to the requested URL so the parent layout's
  // `/{locale}` canonical can never leak through if the DB lookup fails.
  const requestedCanonical = `${SITE_URL}/${locale}/category/${encodeURIComponent(id)}`;

  let category: Awaited<ReturnType<typeof fetchCategoryForSeo>> = null;
  try {
    category = await fetchCategoryForSeo(id);
  } catch (err) {
    console.error("Failed to fetch category for metadata", err);
  }

  if (!category) {
    return {
      title: seo.campaigns.title,
      description: seo.campaigns.description,
      alternates: { canonical: requestedCanonical },
      robots: { index: false, follow: true },
    };
  }

  const t = pickTranslation(category.translations, locale);
  const name = t?.name || category.name;
  const description = (
    t?.heroLead ||
    category.heroLead ||
    t?.description ||
    category.description ||
    seo.campaigns.description
  ).slice(0, 200);
  const image = category.heroImage || category.image || `${SITE_URL}/og-image.jpg`;

  let alternates: { canonical: string; languages?: Record<string, string> };
  try {
    alternates = buildLocalizedAlternates({
      basePath: "/category",
      baseSlug: category.slug,
      translations: category.translations,
      fallback: category.id,
      currentLocale: locale,
    });
  } catch (err) {
    console.error("Failed to build alternates for category", err);
    alternates = { canonical: requestedCanonical };
  }

  const title = `${name} | ${seo.siteName}`;

  return {
    title,
    description,
    keywords: seo.keywords,
    alternates,
    openGraph: {
      title,
      description,
      url: alternates.canonical,
      siteName: seo.siteName,
      locale: OG_LOCALE_MAP[locale as Locale] ?? "en_US",
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: name }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    robots: { index: true, follow: true },
  };
}

/**
 * A category's own landing page — the layout of
 * `Minbar/مشروع ترميم منازل القدس.dc.html`, rendered from the database.
 *
 * Read on the server, like every other indexable page on this site: the copy,
 * the figures and the campaign cards all have to be in the first response
 * (`PRODUCTION_SEO_CONTRACT.md`). This replaced a client-side list that fetched
 * the category and its campaigns after hydration.
 */
export default async function CategoryPage({ params }: Props) {
  const { id, locale } = await params;

  // Redirect to the canonical per-locale slug when the URL doesn't match —
  // e.g. after a language switch keeps the previous locale's slug, or when
  // the URL uses the ObjectId. A category bound to one of the site's own
  // pages (the mosque, zakat) is published there instead, so it goes there.
  try {
    const category = await prisma.category.findFirst({
      where: whereByIdOrAnyLocaleSlug(id),
      select: {
        id: true,
        slug: true,
        pageTemplate: true,
        translations: { select: { locale: true, slug: true } },
      },
    });
    if (category) {
      const template = pageTemplate(category.pageTemplate);
      /* Localised slugs are Arabic in Arabic, and a `Location` header must be
         ASCII, so the path is encoded segment by segment. */
      if (template) redirect(encodeURI(miaPath(TEMPLATE_ROUTES[template], locale)));

      const canonical = pickLocaleSlug(category.slug, category.translations, locale) ?? category.id;
      if (id !== canonical && (isObjectId(id) || id !== category.id)) {
        redirect(`/${locale}/category/${encodeURIComponent(canonical)}`);
      }
    }
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err) throw err;
    console.error("Failed to resolve canonical category slug", err);
  }

  const page = await getCategoryPage(decodeURIComponent(id), locale);
  if (!page) notFound();

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <PageBanners locale={locale} page="projects" slot="top" />
      <CategoryLandingPage page={page} />
      <PageBanners locale={locale} page="projects" slot="bottom" />
    </MinbarMessages>
  );
}
