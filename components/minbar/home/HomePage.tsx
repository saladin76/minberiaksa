"use client";

import VideoModal, { useVideoModal } from "@/components/minbar/VideoModal";
import { IMG } from "@/lib/minbar/content/media";
import type { MinbarProject } from "@/lib/minbar/projects";
import type { MinbarArticle } from "@/lib/minbar/posts";
import type { CmsCourse, CmsFaq, CmsPlaylist, CmsVideo } from "@/lib/minbar/cms";

/** Everything the homepage shows that an editor publishes, read by the page. */
export interface HomeContent {
  courses: CmsCourse[];
  playlists: CmsPlaylist[];
  endorsements: CmsVideo[];
  achievements: CmsVideo[];
  faqs: CmsFaq[];
  articles: MinbarArticle[];
  news: MinbarArticle[];
}
import { Hero, VerseStrip } from "./TopSections";
import QuickDonateBar from "./QuickDonateBar";
import { CoursesRail, EventsSection, ProgramsRail, ReelsSection } from "./MediaSections";
import { ImpactSection, PathSection, RegionCards, UrgentProjectsSection } from "./ImpactSections";
import { AccountSection, RecurringSection, WaqfSection } from "./GivingSections";
import { ArticlesSection, FaqSection, NewsSection } from "./KnowledgeSections";
import TravelBanner from "@/components/minbar/banners/TravelBanner";
import IbadanBanner from "@/components/minbar/banners/IbadanBanner";
import ZakatBanner from "@/components/minbar/banners/ZakatBanner";

/**
 * The homepage, assembled in the locked section order from
 * `Minbar/الصفحة الرئيسية.dc.html`. The order is part of the approved design —
 * `CLAUDE.md` forbids reordering or dropping sections.
 *
 * This is a client component because the video overlay is shared state: the
 * hero, the two reel rails and the courses rail all open into the same player,
 * so one owner has to hold it. The project data is fetched on the server and
 * passed down.
 */
export default function HomePage({
  projects,
  content,
  signedIn,
}: {
  projects: MinbarProject[];
  content: HomeContent;
  signedIn: boolean;
}) {
  const video = useVideoModal();

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
      <VerseStrip />
      <QuickDonateBar projects={projects} />
      <EventsSection />
      <ReelsSection onPlay={video.open} endorsements={content.endorsements} achievements={content.achievements} />
      <PathSection />
      <ProgramsRail playlists={content.playlists} />
      <CoursesRail onPlay={video.open} courses={content.courses} />
      <ImpactSection />
      <TravelBanner />
      <IbadanBanner />
      <UrgentProjectsSection projects={projects} />
      <ZakatBanner />
      <WaqfSection />
      <RecurringSection />
      <RegionCards images={{ quds: IMG.quds, aqsa: IMG.aqsa, relief: IMG.parcels }} />
      <AccountSection signedIn={signedIn} />
      <ArticlesSection articles={content.articles} />
      <NewsSection news={content.news} />
      <FaqSection faqs={content.faqs} />

      <VideoModal embed={video.embed} onClose={video.close} />
    </div>
  );
}
