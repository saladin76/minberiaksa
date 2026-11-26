import { preload } from "react-dom";
import { heroPosterSources } from "@/lib/minbar/hero-poster";
import { buildManagedPageMetadata } from "@/lib/content-editor/page-seo";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { getPublicServerSession } from "@/lib/auth/public-session";
import { LOCALE_SEO } from "@/lib/seo";
import { siteIdentitySchemas, withInstitutionalHomeIdentity } from "@/lib/site-identity";
import type { Locale } from "@/lib/seo";
import { listProjects } from "@/lib/minbar/projects";
import { readQuickDonation } from "@/lib/minbar/quick-donation-read";
import { selectQuickDonationProjectOptions } from "@/lib/minbar/quick-donation-display";
import { readHomeLayout, resolveHomeLists, visibleSections } from "@/lib/minbar/home-layout-read";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import HomePage from "@/components/minbar/home/HomePage";
import PageBanners from "@/components/minbar/banners/PageBanners";
import { publicRamadanSettings } from "@/lib/minbar/ramadan-settings-service";
import { RamadanHomeBanner, RamadanHomeSection } from "@/components/minbar/ramadan/RamadanHome";
import { withLatn } from "@/lib/i18n/latn";

/**
 * Namespaces this page renders, on top of the shell bundle: its own copy, the
 * official impact figures' labels, and the verse strips (the hero's Al-Isra 1
 * and the 'Ibādan Lanā banner's Al-Isra 5).
 */
const NAMESPACES = ["homepage", "achievements", "quran"] as const;

/**
 * Everything the homepage shows except the visitor's session, read together
 * and cached per locale for a minute. Uncached, these ~15 MongoDB queries ran
 * on every visit and kept the server ~1.7 s from sending the first byte
 * (PageSpeed: LCP breakdown, "time to first byte"). Dashboard edits, raised
 * amounts and new posts show within 60 s. All of it is plain JSON (strings,
 * numbers), which `unstable_cache` requires.
 */
const cachedHomeData = unstable_cache(
  async (locale: string) => {
    const projectsRead = listProjects(locale);
    const layoutRead = readHomeLayout();
    const [projects, quick, layout, lists] = await Promise.all([
      projectsRead,
      readQuickDonation(),
      layoutRead,
      layoutRead.then((l) => resolveHomeLists(locale, l, projectsRead)),
    ]);
    const quickProjects = selectQuickDonationProjectOptions(quick, projects);
    return { quick, quickProjects, layout, lists };
  },
  ["minbar-home-data"],
  { revalidate: 60, tags: ["minbar-home"] }
);

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const seo = LOCALE_SEO[locale as Locale] ?? LOCALE_SEO.en;
  return withInstitutionalHomeIdentity(await buildManagedPageMetadata("home", locale, {
    title: seo.title,
    description: seo.description,
    path: "/",
    keywords: seo.keywords,
  }), locale);
}

/**
 * Homepage  the Minbar Al-Aqsa design, ported from
 * `Minbar/الصفحة الرئيسية.dc.html`.
 *
 * Projects are read here rather than fetched from the client so the urgent rail
 * and the quick-donation bar's destination list are in the first HTML response.
 * `PRODUCTION_SEO_CONTRACT.md` requires server-rendered metadata and content 
 * a client-only fetch would leave the homepage's project copy out of the index.
 */
export default async function Home({ params }: Props) {
  const { locale } = await params;
  const poster = heroPosterSources(locale);
  preload(poster.src, { as: "image", imageSrcSet: poster.srcSet, imageSizes: poster.sizes, fetchPriority: "high" });

  // Every section's content is read here, in parallel, so the whole homepage is
  // in the first HTML response rather than filled in by client fetches. Which
  // sections show, in what order, and which items each list picks are the
  // dashboard's homepage layout (`lib/minbar/home-layout.ts`); its defaults are
  // the approved design. The quick-donation select lists whatever its own
  // settings allow, which may be every project.
  const [{ quick, quickProjects, layout, lists }, session, ramadan] = await Promise.all([
    cachedHomeData(locale),
    getPublicServerSession(),
    publicRamadanSettings().catch(() => null),
  ]);
  // Ramadan scheduling on the homepage: each piece has its own dashboard switch and needs the
  // service itself switched on, so a visitor is never sent to a hidden page.
  const showRamadanBanner = Boolean(ramadan?.enabled && ramadan.homeBanner), showRamadanSection = Boolean(ramadan?.enabled && ramadan.homeSection);
  const ramadanProps = ramadan ? (() => {
    const [y, m, d] = ramadan.startDate.split("-").map(Number), start = Date.UTC(y, m - 1, d);
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
    const daysLeft = Math.ceil((start - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86_400_000);
    return { locale, hijriYear: ramadan.hijriYear, daysLeft, startDate: ramadan.startDate, startLabel: new Intl.DateTimeFormat(withLatn(locale), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(start)) };
  })() : null;

  const organisationSchema = siteIdentitySchemas(locale);

  return (
    <>
      {/* `PRODUCTION_SEO_CONTRACT.md` § Structured Data: Organization + WebSite
          on the homepage only, and nothing describing data the page does not
          actually show. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organisationSchema) }}
      />
      <MinbarMessages locale={locale} namespaces={showRamadanBanner || showRamadanSection ? [...NAMESPACES, "ramadan"] : NAMESPACES}>
        <HomePage
          sections={visibleSections(layout)}
          lists={lists}
          quick={{ config: quick, projects: quickProjects }}
          banners={{
            top: <>{showRamadanBanner && ramadanProps ? <RamadanHomeBanner {...ramadanProps} /> : null}<PageBanners locale={locale} page="home" slot="top" /></>,
            middle: <PageBanners locale={locale} page="home" slot="middle" />,
            bottom: <PageBanners locale={locale} page="home" slot="bottom" />,
          }}
          signedIn={!!session?.user}
          ramadanSection={showRamadanSection && ramadanProps ? <RamadanHomeSection {...ramadanProps} /> : null}
        />
      </MinbarMessages>
    </>
  );
}
