import { Metadata } from "next";
import { redirect } from "next/navigation";
import MainPageDummy from "../_components/MainPageDummy";
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
import { buildSeoFallback, compactSeoFields, type ProjectSeoFields } from "@/lib/campaign/project-seo";

interface Props {
  params: Promise<{ id: string; locale: string }>;
}

type MongoDocument = Record<string, unknown>;

function firstBatch(result: unknown): MongoDocument[] {
  const cursor = (result as { cursor?: { firstBatch?: MongoDocument[] } })?.cursor;
  return Array.isArray(cursor?.firstBatch) ? cursor.firstBatch : [];
}

function getSeoFieldsFromDocument(doc?: MongoDocument | null): ProjectSeoFields {
  return compactSeoFields({
    seoTitle: typeof doc?.seoTitle === "string" ? doc.seoTitle : null,
    seoDescription: typeof doc?.seoDescription === "string" ? doc.seoDescription : null,
    ogTitle: typeof doc?.ogTitle === "string" ? doc.ogTitle : null,
    ogDescription: typeof doc?.ogDescription === "string" ? doc.ogDescription : null,
    ogImage: typeof doc?.ogImage === "string" ? doc.ogImage : null,
  });
}

async function fetchCampaignSeoDocuments(campaignId: string, locale: string) {
  const [campaignResult, translationResult] = await Promise.all([
    prisma.$runCommandRaw({
      find: "Campaign",
      filter: { _id: { $oid: campaignId } },
      limit: 1,
    }),
    locale === "ar"
      ? Promise.resolve(null)
      : prisma.$runCommandRaw({
          find: "CampaignTranslation",
          filter: { campaignId: { $oid: campaignId }, locale },
          limit: 1,
        }),
  ]);

  return {
    campaignSeo: getSeoFieldsFromDocument(firstBatch(campaignResult)[0]),
    translationSeo: translationResult ? getSeoFieldsFromDocument(firstBatch(translationResult)[0]) : null,
  };
}

async function fetchCampaignForSeo(idOrSlug: string) {
  return prisma.campaign.findFirst({
    where: whereByIdOrAnyLocaleSlug(idOrSlug),
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      images: true,
      translations: {
        select: {
          locale: true,
          title: true,
          description: true,
          image: true,
          slug: true,
        },
      },
    },
  });
}

const URGENCY_PREFIX: Record<string, string> = {
  ar: "ساعد الآن — ",
  en: "Urgent: ",
  tr: "Acil: ",
  fr: "Urgent : ",
  es: "Urgente: ",
  pt: "Urgente: ",
  id: "Mendesak: ",
  de: "Dringend: ",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, locale } = await params;
  const seo = LOCALE_SEO[locale as Locale] ?? LOCALE_SEO.en;
  const requestedCanonical = `${SITE_URL}/${locale}/campaign/${encodeURIComponent(id)}`;

  let campaign: Awaited<ReturnType<typeof fetchCampaignForSeo>> = null;
  try {
    campaign = await fetchCampaignForSeo(id);
  } catch (err) {
    console.error("Failed to fetch campaign for metadata", err);
  }

  if (!campaign) {
    return {
      title: seo.campaigns.title,
      description: seo.campaigns.description,
      alternates: { canonical: requestedCanonical },
      robots: { index: false, follow: true },
    };
  }

  const t = pickTranslation(campaign.translations, locale);
  const localeTitle = t?.title || campaign.title || seo.campaigns.title;
  const localeDescription = t?.description || campaign.description || seo.campaigns.description;
  const localeImage = (t as { image?: string | null } | undefined)?.image || campaign.images?.[0] || `${SITE_URL}/og-image.jpg`;

  let storedSeo: { campaignSeo: ProjectSeoFields; translationSeo: ProjectSeoFields | null } = {
    campaignSeo: {},
    translationSeo: null,
  };
  try {
    storedSeo = await fetchCampaignSeoDocuments(campaign.id, locale);
  } catch (err) {
    console.error("Failed to fetch campaign SEO fields", err);
  }

  const resolvedSeo = buildSeoFallback({
    localeFields: locale === "ar" ? storedSeo.campaignSeo : storedSeo.translationSeo,
    localeTitle,
    localeDescription,
    localeImage,
    campaignFields: storedSeo.campaignSeo,
    campaignTitle: campaign.title,
    campaignDescription: campaign.description,
    campaignImage: campaign.images?.[0] || `${SITE_URL}/og-image.jpg`,
  });

  const description = String(resolvedSeo.seoDescription || seo.campaigns.description).slice(0, 160);
  const longDescription = String(resolvedSeo.ogDescription || resolvedSeo.seoDescription || seo.campaigns.description).slice(0, 200);
  const image = resolvedSeo.ogImage || localeImage || `${SITE_URL}/og-image.jpg`;

  let alternates: { canonical: string; languages: Record<string, string> } | { canonical: string };
  try {
    alternates = buildLocalizedAlternates({
      basePath: "/campaign",
      baseSlug: campaign.slug,
      translations: campaign.translations,
      fallback: campaign.id,
      currentLocale: locale,
    });
  } catch (err) {
    console.error("Failed to build alternates for campaign", err);
    alternates = { canonical: requestedCanonical };
  }

  const prefix = URGENCY_PREFIX[locale] ?? "";
  const title = String(resolvedSeo.seoTitle || localeTitle || seo.campaigns.title);
  const ogTitle = String(resolvedSeo.ogTitle || resolvedSeo.seoTitle || localeTitle || seo.campaigns.title);
  const fullTitle = `${prefix}${title} | ${seo.siteName}`;
  const fullOgTitle = `${prefix}${ogTitle} | ${seo.siteName}`;

  return {
    title: fullTitle,
    description,
    keywords: seo.keywords,
    alternates,
    openGraph: {
      title: fullOgTitle,
      description: longDescription,
      url: alternates.canonical,
      siteName: seo.siteName,
      locale: OG_LOCALE_MAP[locale as Locale] ?? "en_US",
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: ogTitle }],
    },
    twitter: {
      card: "summary_large_image",
      title: fullOgTitle,
      description: longDescription,
      images: [image],
    },
    robots: { index: true, follow: true },
  };
}

export default async function CampaignPage({ params }: Props) {
  const { id, locale } = await params;

  try {
    const campaign = await prisma.campaign.findFirst({
      where: whereByIdOrAnyLocaleSlug(id),
      select: {
        id: true,
        slug: true,
        translations: { select: { locale: true, slug: true } },
      },
    });
    if (campaign) {
      const canonical = pickLocaleSlug(campaign.slug, campaign.translations, locale) ?? campaign.id;
      if (id !== canonical && (isObjectId(id) || id !== campaign.id)) {
        redirect(`/${locale}/campaign/${encodeURIComponent(canonical)}`);
      }
    }
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err) throw err;
    console.error("Failed to resolve canonical campaign slug", err);
  }

  return <MainPageDummy id={id} locale={locale} />;
}
