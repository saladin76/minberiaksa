import { PatternBackground } from "@/components/brand/pattern-background";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { StickyDonateBar } from "@/components/layout/sticky-donate-bar";
import { TopUtilityBar } from "@/components/layout/top-utility-bar";
import {
  HomepageHero,
  ImpactReels,
  ImpactStats,
  ImpactStories,
  KnowledgeCenter,
  MinberFunds,
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
        <ImpactStories />
        <PatternBackground intensity="medium" position="full" fadeDirection="both" className="homepage-pattern-shell">
          <HomepageHero />
        </PatternBackground>
        <QuickDonation />
        <OfficialProjects />
        <MinberFunds />
        <ZakatGateway />
        <WaqfGateway />
        <RecurringGiving />
        <ImpactReels />
        <PatternBackground intensity="soft" position="full" fadeDirection="both" className="wide-divider-pattern">
          <ImpactStats />
        </PatternBackground>
        <TrustProof />
        <KnowledgeCenter />
        <PatternBackground intensity="medium" position="bottom" fadeDirection="top" className="final-cta-pattern">
          <SoftGateway />
        </PatternBackground>
      </main>
      <SiteFooter />
      <StickyDonateBar />
    </>
  );
}
