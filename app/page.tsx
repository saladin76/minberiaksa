import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { StickyDonateBar } from "@/components/layout/sticky-donate-bar";
import { TopUtilityBar } from "@/components/layout/top-utility-bar";
import { HomepageRouteEnhancer } from "@/components/homepage/homepage-route-enhancer";
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
        <HomepageHero />
        <QuickDonation />
        <OfficialProjects />
        <MinberFunds />
        <ZakatGateway />
        <WaqfGateway />
        <RecurringGiving />
        <ImpactReels />
        <ImpactStats />
        <TrustProof />
        <KnowledgeCenter />
        <SoftGateway />
        <HomepageRouteEnhancer />
      </main>
      <SiteFooter />
      <StickyDonateBar />
    </>
  );
}
