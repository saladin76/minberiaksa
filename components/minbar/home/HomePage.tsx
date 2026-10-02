"use client";

import { Fragment, type ReactNode } from "react";
import VideoModal, { useVideoModal } from "@/components/minbar/VideoModal";
import { IMG } from "@/lib/minbar/content/media";
import type { MinbarProject } from "@/lib/minbar/projects";
import type { QuickDonationConfig } from "@/lib/minbar/quick-donation";
import type { HomeSectionId } from "@/lib/minbar/home-layout";
import type { HomeLists } from "@/lib/minbar/home-layout-read";
import { Hero, VerseStrip } from "./TopSections";
import QuickDonateBar from "./QuickDonateBar";
import { CoursesRail, EventsSection, ProgramsRail, ReelsSection } from "./MediaSections";
import { ImpactSection, PathSection, RegionCards, UrgentProjectsSection } from "./ImpactSections";
import { AccountSection, RecurringSection, WaqfSection } from "./GivingSections";
import { ArticlesSection, FaqSection, NewsSection } from "./KnowledgeSections";
import CategoriesSection from "./CategoriesSection";
import TravelBanner from "@/components/minbar/banners/TravelBanner";
import IbadanBanner from "@/components/minbar/banners/IbadanBanner";
import ZakatBanner from "@/components/minbar/banners/ZakatBanner";

/**
 * The homepage, from `Minbar/الصفحة الرئيسية.dc.html`.
 *
 * The hero and the quick-donation bar always open the page  the bar is sticky
 * "right under the hero" by design. Every section after them renders in the
 * order the dashboard's homepage layout sets (`/dashboard/homepage-layout`),
 * hidden ones left out; that layout's defaults are the approved design's order.
 * The lists arrive already picked and ranked by the same layout.
 *
 * This is a client component because the video overlay is shared state: the
 * hero, the two reel rails and the courses rail all open into the same player,
 * so one owner has to hold it. The data is fetched on the server and passed down.
 */
export default function HomePage({
  sections,
  lists,
  quick,
  banners,
  signedIn,
}: {
  /** The visible sections after the quick-donation bar, in display order. */
  sections: HomeSectionId[];
  lists: HomeLists;
  /** The quick-donation bar as the dashboard configured it, with every project it may list. */
  quick: { config: QuickDonationConfig; projects: MinbarProject[] };
  /** Dashboard banners, already rendered on the server, one node per slot. */
  banners: { top: ReactNode; middle: ReactNode; bottom: ReactNode };
  signedIn: boolean;
}) {
  const video = useVideoModal();

  const render: Record<HomeSectionId, () => ReactNode> = {
    verse: () => <VerseStrip />,
    bannersTop: () => banners.top,
    events: () => <EventsSection events={lists.events} />,
    reels: () => <ReelsSection onPlay={video.open} endorsements={lists.endorsements} achievements={lists.achievements} />,
    path: () => <PathSection />,
    programs: () => <ProgramsRail playlists={lists.programs} />,
    courses: () => <CoursesRail onPlay={video.open} courses={lists.courses} />,
    impact: () => <ImpactSection />,
    bannersMiddle: () => banners.middle,
    travel: () => <TravelBanner />,
    ibadan: () => <IbadanBanner />,
    urgent: () => <UrgentProjectsSection projects={lists.projects} />,
    categories: () => <CategoriesSection categories={lists.categories} />,
    zakat: () => <ZakatBanner />,
    waqf: () => <WaqfSection />,
    recurring: () => <RecurringSection />,
    regions: () => <RegionCards images={{ quds: IMG.quds, aqsa: IMG.aqsa, relief: IMG.parcels }} />,
    account: () => <AccountSection signedIn={signedIn} />,
    bannersBottom: () => banners.bottom,
    articles: () => <ArticlesSection articles={lists.articles} />,
    news: () => <NewsSection news={lists.news} />,
    faqs: () => <FaqSection faqs={lists.faqs} />,
  };

  return (
    <div style={{ position: "relative" }}>
      {/* Page-wide ornament wash, behind everything and never interactive. */}
      <div
        aria-hidden="true"
        data-aqsa-pattern=""
        style={{
          position: "fixed",
          inset: 0,
          backgroundImage: "url('/minbar/assets/patterns/aqsa-white-pattern.webp')",
          backgroundRepeat: "repeat",
          backgroundSize: "620px 620px",
          opacity: 0.085,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <Hero onPlayIntro={video.open} />
      {/* Sticky under the header from here on  the design places it right under the hero. */}
      <QuickDonateBar config={quick.config} projects={quick.projects} />
      {sections.map((id) => (
        <Fragment key={id}>{render[id]()}</Fragment>
      ))}

      <VideoModal embed={video.embed} onClose={video.close} />
    </div>
  );
}

