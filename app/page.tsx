import { PatternBackground } from "@/components/brand/pattern-background";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { StickyDonateBar } from "@/components/layout/sticky-donate-bar";
import { TopUtilityBar } from "@/components/layout/top-utility-bar";
import {
  DonationJourney,
  GivingIntentNavigation,
  HomepageHero,
  ImpactReels,
  ImpactStats,
  ImpactStories,
  KnowledgeCenter,
  OfficialProjects,
  QuickDonation,
  RecurringGiving,
  SoftGateway,
  TrustProof,
  WaqfGateway,
  ZakatGateway,
} from "@/components/homepage/homepage-sections";

export default function HomePage() {
  return (
    <>
      <TopUtilityBar />
      <SiteHeader />
      <main id="main-content">
        <PatternBackground intensity="medium" position="full" fadeDirection="both" variant="directional" tone="home" className="homepage-pattern-shell">
          <HomepageHero />
        </PatternBackground>
        <QuickDonation />
        <GivingIntentNavigation />
        <OfficialProjects />
        <DonationJourney />
        <ZakatGateway />
        <WaqfGateway />
        <RecurringGiving />
        <PatternBackground intensity="soft" position="full" fadeDirection="both" variant="dark" className="impact-trust-pattern">
          <ImpactStats />
        </PatternBackground>
        <TrustProof />
        <ImpactStories />
        <ImpactReels />
        <KnowledgeCenter />
        <PatternBackground intensity="medium" position="bottom" fadeDirection="top" variant="dark" className="final-cta-pattern">
          <SoftGateway />
        </PatternBackground>
      </main>
      <SiteFooter />
      <StickyDonateBar />
    </>
  );
}
