import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { LOCALE_SEO, buildPageMetadata, SITE_URL } from "@/lib/seo";
import type { Locale } from "@/lib/seo";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { listProjects } from "@/lib/minbar/projects";
import { listArticles, listNews } from "@/lib/minbar/posts";
import { listCourses, listFaqs, listPlaylists, listVideos } from "@/lib/minbar/cms";
import { readQuickDonation } from "@/lib/minbar/quick-donation-read";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import HomePage from "@/components/minbar/home/HomePage";

/**
 * Namespaces this page renders, on top of the shell bundle: its own copy, the
 * official impact figures' labels, and the verse strips (the hero's Al-Isra 1
 * and the 'Ibādan Lanā banner's Al-Isra 5).
 */
const NAMESPACES = ["homepage", "achievements", "quran"] as const;

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const seo = LOCALE_SEO[locale as Locale] ?? LOCALE_SEO.en;
  return buildPageMetadata(locale, {
    title: seo.title,
    description: seo.description,
    path: "/",
    keywords: seo.keywords,
  });
}

/**
 * Homepage — the Minbar Al-Aqsa design, ported from
 * `Minbar/الصفحة الرئيسية.dc.html`.
 *
 * Projects are read here rather than fetched from the client so the urgent rail
 * and the quick-donation bar's destination list are in the first HTML response.
 * `PRODUCTION_SEO_CONTRACT.md` requires server-rendered metadata and content —
 * a client-only fetch would leave the homepage's project copy out of the index.
 */
export default async function Home({ params }: Props) {
  const { locale } = await params;

  // Every section's content is read here, in parallel, so the whole homepage is
  // in the first HTML response rather than filled in by client fetches — the
  // rails show a leading slice; each full set lives on its own page.
  // The urgent rail shows a leading slice of projects; the quick-donation
  // select lists whatever the dashboard allows, which may be every project.
  const [projects, allProjects, quick, session, courses, playlists, endorsements, achievements, faqs, articlesPage, news] = await Promise.all([
    listProjects(locale, 12),
    listProjects(locale),
    readQuickDonation(),
    getServerSession(authOptions),
    listCourses(locale),
    listPlaylists(locale),
    listVideos(locale, "ENDORSEMENT"),
    listVideos(locale, "ACHIEVEMENT"),
    listFaqs(locale),
    listArticles({ locale, take: 4 }),
    listNews(locale, 4),
  ]);

  const organisationSchema = {
    "@context": "https://schema.org",
    "@type": ["Organization", "NGO"],
    "@id": `${SITE_URL}/#organization`,
    url: `${SITE_URL}/${locale}`,
    name: LOCALE_SEO[locale as Locale]?.siteName ?? LOCALE_SEO.en.siteName,
    description: LOCALE_SEO[locale as Locale]?.description ?? LOCALE_SEO.en.description,
  };

  return (
    <>
      {/* `PRODUCTION_SEO_CONTRACT.md` § Structured Data: Organization + WebSite
          on the homepage only, and nothing describing data the page does not
          actually show. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organisationSchema) }}
      />
      <MinbarMessages locale={locale} namespaces={NAMESPACES}>
        <HomePage
          projects={projects}
          quick={{ config: quick, projects: allProjects }}
          content={{ courses, playlists, endorsements, achievements, faqs, articles: articlesPage.items, news }}
          signedIn={!!session?.user}
        />
      </MinbarMessages>
    </>
  );
}
