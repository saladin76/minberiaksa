import { PatternBackground } from "@/components/brand/pattern-background";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { StickyDonateBar } from "@/components/layout/sticky-donate-bar";
import { TopUtilityBar } from "@/components/layout/top-utility-bar";
import {
  DonationJourney,
  GivingIntentNavigation,
  GivingPathways,
  HomepageHero,
  ImpactAndTrust,
  KnowledgeCenter,
  OfficialProjects,
  SoftGateway,
} from "@/components/homepage/homepage-sections";
import { QuickGiving } from "@/components/homepage/quick-giving";

export default function HomePage() {
  return (
    <>
      <TopUtilityBar />
      <SiteHeader />
      <main id="main-content" className="homepage-v4">
        <PatternBackground intensity="medium" position="full" fadeDirection="both" variant="directional" tone="home" className="homepage-pattern-shell">
          <HomepageHero />
        </PatternBackground>
        <QuickGiving />
        <GivingIntentNavigation />
        <OfficialProjects />
        <DonationJourney />
        <GivingPathways />
        <PatternBackground intensity="soft" position="full" fadeDirection="both" variant="dark" className="impact-trust-pattern">
          <ImpactAndTrust />
        </PatternBackground>
        <KnowledgeCenter />
        <PatternBackground intensity="medium" position="bottom" fadeDirection="top" variant="section" tone="waqf" className="final-cta-pattern-v4">
          <SoftGateway />
        </PatternBackground>
      </main>
      <SiteFooter />
      <StickyDonateBar />
    </>
  );
}
