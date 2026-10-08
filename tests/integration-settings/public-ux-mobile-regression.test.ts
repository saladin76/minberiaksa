import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("mobile public UX keeps donation touch targets at least 44px", () => {
  const css = read("styles/minbar/minbar.css");
  assert.match(css, /pdc-amounts > button[\s\S]*min-height: 44px/);
  assert.match(css, /#pd-aside :is\(button, input, select\) \{ min-height: 44px/);
  assert.match(css, /#proj-filters > \.proj-cat \{ min-height: 44px/);
  assert.match(css, /mia-main-row \.mia-circle \{ width: 44px !important; height: 44px/);
});

test("mobile menu owns the remaining viewport and clears floating controls", () => {
  const css = read("styles/minbar/minbar.css");
  assert.match(css, /mia-pop--menu[\s\S]*height: calc\(100dvh - var\(--mia-head-h, 64px\)\)/);
  assert.match(css, /data-mia-drawer="open"[\s\S]*mia-qb-sec/);
});

test("projects filter rail exposes horizontal overflow on phones", () => {
  const page = read("components/minbar/projects/ProjectsPage.tsx");
  const css = read("styles/minbar/minbar.css");
  assert.match(page, /className="proj-filters-wrap"/);
  assert.match(css, /proj-filters-wrap::after/);
  assert.match(css, /#proj-filters[\s\S]*overflow-x: auto/);
});

test("project cards do not show an unlabeled zero raised figure beside a real goal", () => {
  const card = read("components/minbar/ProjectDonateCard.tsx");
  assert.match(card, /project\.raised > 0 \? \(/);
});

test("mobile project detail puts donation before optional video content", () => {
  const detail = read("components/minbar/projects/ProjectDetail.tsx");
  const css = read("styles/minbar/minbar.css");
  assert.match(detail, /className="pd-project-main"/);
  assert.match(detail, /className="pd-project-video"/);
  assert.match(css, /#pd-top #pd-aside \{ order: 3; \}/);
  assert.match(css, /#pd-top \.pd-project-video \{ order: 4; \}/);
});

test("team support remains optional and never blocks checkout", () => {
  const cart = read("components/minbar/cart/CartPage.tsx");
  assert.doesNotMatch(cart, /teamSupportPending/);
  assert.doesNotMatch(cart, /nudgeTeamSupport/);
  assert.match(cart, /href=\{miaPath\("checkout", locale\)\}/);
});


test("zakat calculator uses the visitor currency instead of a fixed dollar unit", () => {
  const page = read("components/minbar/zakat/ZakatPage.tsx");
  assert.match(page, /formatLocal, code: visitorCode/);
  assert.match(page, /\{visitorCode\}/);
  assert.match(page, /addZakat\(dueRounded, visitorCode\)/);
  assert.doesNotMatch(page, /addZakat\(Math\.round\(due\)\)/);
});

test("mobile donor controls cannot regress below the 44px touch target", () => {
  const css = read("styles/minbar/minbar.css");
  assert.match(css, /#meter-picker \.wq-step[\s\S]*width: 44px !important;[\s\S]*height: 44px !important/);
  assert.match(css, /#rc-grid \.rc-seg[\s\S]*height: 44px !important/);
  assert.match(css, /cart-row \.cart-monthly[\s\S]*height: 44px !important/);
  assert.match(css, /#upsell-rail > div button[\s\S]*height: 44px !important/);
  assert.match(css, /#pay-grid button\[role="radio"\][\s\S]*height: 44px !important/);
});

test("mobile donor layouts constrain wide content to the viewport", () => {
  const css = read("styles/minbar/minbar.css");
  assert.match(css, /#zk-hero-grid, #meter-picker, #rc-grid, #cart-grid, #pay-grid, #pd-top, #pd-body/);
  assert.match(css, /max-width: 100%/);
  assert.match(css, /pay-phone-dropdown[\s\S]*max-width: calc\(100vw - 32px\)/);
  assert.match(css, /upsell-custom-input[\s\S]*min-width: 90px !important/);
});

test("guest checkout rejects an empty phone that is only a dial code", () => {
  const page = read("components/minbar/checkout/CheckoutPage.tsx");
  assert.match(page, /const phoneDigits = phone\.replace\(\/\\D\/g, ""\)/);
  assert.match(page, /phoneDigits\.length < 7/);
});


test("recurring donation puts the plan builder before video on phones", () => {
  const page = read("components/minbar/recurring/RecurringPage.tsx");
  const css = read("styles/minbar/minbar.css");
  assert.match(page, /className="rc-builder"/);
  assert.match(css, /#rc-grid \.rc-builder \{ order: 1; \}/);
  assert.match(css, /#rc-grid \.rc-video \{ order: 2; \}/);
});

test("checkout puts the donation summary before the form on phones only", () => {
  const page = read("components/minbar/checkout/CheckoutPage.tsx");
  const css = read("styles/minbar/minbar.css");
  assert.match(page, /className="pay-form"/);
  assert.match(css, /#pay-grid #pay-summary[\s\S]*order: 1/);
  assert.match(css, /#pay-grid \.pay-form \{ order: 2; \}/);
});


test("homepage phone sections do not clip content into horizontal rails", () => {
  const css = read("styles/minbar/minbar.css");
  assert.match(css, /#path-steps,[\s\S]*#impact-metrics,[\s\S]*#sector-metrics,[\s\S]*#regions,[\s\S]*#waqf-areas,[\s\S]*#account-features[\s\S]*display: grid !important/);
  assert.match(css, /#regions[\s\S]*grid-template-columns: minmax\(0, 1fr\) !important/);
  assert.match(css, /#account-features[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important/);
});

test("homepage and project catalogue remove oversized mobile dead space", () => {
  const home = read("components/minbar/home/ImpactSections.tsx");
  const projects = read("components/minbar/projects/ProjectsPage.tsx");
  const css = read("styles/minbar/minbar.css");
  assert.match(home, /id="regions-section"/);
  assert.match(projects, /id="project-filters-section"/);
  assert.match(css, /#project-filters-section > div[\s\S]*padding-bottom: 12px !important/);
  assert.match(css, /#all[\s\S]*padding-top: 14px !important/);
});


test("mobile giving assistant stays fully visible and draggable", () => {
  const launcher = read("components/minbar/concierge/ConciergeLauncher.tsx");
  const css = read("styles/minbar/minbar.css");
  assert.match(launcher, /MOBILE_POS_KEY/);
  assert.match(launcher, /onLauncherPointerDown/);
  assert.match(launcher, /setPointerCapture/);
  assert.match(launcher, /data-draggable="1"/);
  assert.match(css, /cg-launch-wrap\[data-draggable="1"\][\s\S]*max-width: calc\(100vw - 28px\)/);
  assert.match(css, /cg-launcher-label[\s\S]*position: static !important/);
  assert.match(css, /cg-launcher-badge[\s\S]*display: inline-flex !important/);
});

test("long-form Al-Aqsa and Jerusalem pages stay inside the phone viewport", () => {
  const css = read("styles/minbar/minbar.css");
  assert.match(css, /:is\(\.aq-page, \.qd-page\)[\s\S]*overflow-x: clip/);
  assert.match(css, /\.qd-two,[\s\S]*\.qd-map[\s\S]*grid-template-columns: minmax\(0,1fr\) !important/);
  assert.match(css, /\.qd-grid3,[\s\S]*\.qd-grid4,[\s\S]*\.qd-gates[\s\S]*grid-template-columns: minmax\(0,1fr\) !important/);
});


test("mobile bottom navigation exposes the seven requested destinations", () => {
  const nav = read("components/minbar/shell/MobileBottomNav.tsx");
  const layout = read("app/[locale]/layout.tsx");
  assert.match(layout, /<MobileBottomNav signedIn=/);
  assert.match(nav, /route: "account"/);
  assert.match(nav, /route: "projects"/);
  assert.match(nav, /route: "achievementVideos"/);
  assert.match(nav, /route: "home"/);
  assert.match(nav, /route: "waqf"/);
  assert.match(nav, /route: "recurring"/);
  assert.match(nav, /route: "zakat"/);
});

test("mobile bottom navigation persists through payment flows and clears floating actions", () => {
  const nav = read("components/minbar/shell/MobileBottomNav.tsx");
  const css = read("styles/minbar/minbar.css");
  assert.doesNotMatch(nav, /HIDDEN_ROUTES|return null/);
  assert.match(css, /mia-mobile-bottom-nav[\s\S]*z-index: 260 !important/);
  assert.match(css, /--mia-mobile-nav-h: 74px/);
  assert.match(css, /cg-launch-wrap[\s\S]*var\(--mia-mobile-nav-h\)/);
  assert.match(css, /mia-wa-fab[\s\S]*var\(--mia-mobile-nav-h\)/);
  assert.match(css, /data-mia-drawer="open"[\s\S]*mia-mobile-bottom-nav/);
});


test("homepage phone hero shows the video before its conversion buttons", () => {
  const hero = read("components/minbar/home/TopSections.tsx");
  const css = read("styles/minbar/minbar.css");
  const mediaAt = hero.indexOf('className="mia-hero-media"');
  const mobileActionsAt = hero.indexOf('className="mia-hero-actions mia-hero-actions--mobile"');
  assert.ok(mediaAt >= 0 && mobileActionsAt > mediaAt);
  assert.match(css, /mia-hero-actions--desktop[\s\S]*display: none !important/);
  assert.match(css, /mia-hero-actions--mobile[\s\S]*display: grid !important/);
});

test("homepage hero no longer duplicates the reports proof strip", () => {
  const hero = read("components/minbar/home/TopSections.tsx");
  assert.doesNotMatch(hero, /mia-hero-proof/);
  assert.doesNotMatch(hero, /BIG_STATS/);
});

test("mobile impact, campaign banners and waqf use the refined layouts", () => {
  const css = read("styles/minbar/minbar.css");
  assert.match(css, /#impact-metrics[\s\S]*grid-template-columns: repeat\(2, minmax\(0,1fr\)\) !important/);
  assert.match(css, /#sector-metrics[\s\S]*grid-template-columns: repeat\(2, minmax\(0,1fr\)\) !important/);
  assert.match(css, /\.friday-body,[\s\S]*\.ibadan-body[\s\S]*min-height: 220px !important/);
  assert.match(css, /#waqf-areas[\s\S]*grid-template-columns: repeat\(2, minmax\(0,1fr\)\) !important/);
});

test("projects responsive fixes are page scoped and take precedence across phone/tablet breakpoints", () => {
  const page = read("components/minbar/projects/ProjectsPage.tsx");
  const css = read("styles/minbar/minbar.css");
  assert.match(page, /className="mia-projects-page"/);
  assert.match(page, /aria-pressed=\{category === c\.id\}/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.mia-projects-page #proj-filters \{[\s\S]*flex-wrap: nowrap !important/);
  assert.match(css, /\.mia-projects-page #all \{[\s\S]*padding: 6px 0/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.mia-projects-page \.proj-grid \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.mia-projects-page \.proj-arrow \{ display: none !important/);
});

test("mobile catalogue hero removes dead bands while preserving desktop markup", () => {
  const hero = read("components/minbar/projects/ProjectsHero.tsx");
  const css = read("styles/minbar/minbar.css");
  assert.match(hero, /className="mia-projects-hero"/);
  assert.match(css, /\.mia-projects-page \.mia-projects-hero \.proj-hero-stage \{/);
  assert.match(css, /\.mia-projects-page \.proj-hero-stage > div\[aria-hidden\] > span\[role="img"\]/);
});

test("public header search exposes suggestions and localized routes without donor records", () => {
  const header = read("components/minbar/shell/Header.tsx");
  const control = read("components/minbar/shell/HeaderSearch.tsx");
  const page = read("app/[locale]/search/page.tsx");
  const api = read("app/api/minbar/search/route.ts");
  const source = read("lib/minbar/public-search.ts");
  assert.match(header, /<HeaderSearch \/>/);
  assert.match(control, /aria-expanded=\{open\}/);
  assert.match(control, /aria-controls="mia-header-search-panel"/);
  assert.match(control, /AbortController/);
  assert.match(page, /searchPublicContent/);
  assert.match(api, /SUPPORTED_LOCALES/);
  assert.match(source, /listProjects\(locale\)/);
  assert.match(source, /listArticles\(\{ locale, take: 400 \}\)/);
  assert.doesNotMatch(source, /prisma\.user|prisma\.donation|findMany\(\{\s*where:\s*\{\s*donorId/i);
});

test("responsive public catalogue and donor account preserve readable narrow grids", () => {
  const css = read("styles/minbar/minbar.css");
  assert.match(css, /\.blog-layout \{ grid-template-columns: minmax\(0,1fr\) !important/);
  assert.match(css, /\.mia-site-search-page__grid \{ grid-template-columns: minmax\(0,1fr\)/);
  assert.match(css, /\.acc-page \.acc-stats \{ grid-template-columns: repeat\(3,minmax\(0,1fr\)\)/);
});

test("mobile project hero keeps photography visible under a light overlay", () => {
  const css = read("styles/minbar/minbar.css");
  assert.match(css, /proj-hero-stage > div\[aria-hidden\] > span\[role="img"\] \+ span/);
  assert.match(css, /rgba\(16,33,43,\.11\)/);
});

test("Jerusalem impact cards keep long totals in a full-width featured panel", () => {
  const component = read("components/minbar/home/ImpactSections.tsx");
  const css = read("styles/minbar/minbar.css");
  assert.match(component, /mia-impact-stat--featured/);
  assert.match(component, /mia-impact-sectors/);
  assert.match(css, /mia-impact-summary > \.mia-impact-stat--featured \{ grid-column: 1\/-1/);
  assert.match(css, /mia-impact-stat > b\[dir="ltr"\][\s\S]*white-space: nowrap/);
  assert.match(css, /mia-impact-sectors > \.mia-impact-sector[\s\S]*min-width: 0/);
});

test("shared Ibadan and travel banners do not force headlines or CTA labels outside mobile viewport", () => {
  const travel = read("components/minbar/banners/TravelBanner.tsx");
  const ibadan = read("components/minbar/banners/IbadanBanner.tsx");
  const css = read("styles/minbar/minbar.css");
  for (const component of [travel, ibadan]) {
    assert.match(component, /mia-campaign-banner-content/);
    assert.match(component, /mia-campaign-banner-actions/);
    assert.doesNotMatch(component, /whiteSpace: "nowrap", fontSize: "clamp\(18px,2vw,28px\)"/);
  }
  assert.match(css, /mia-campaign-banner-content h2[\s\S]*white-space: normal !important/);
  assert.match(css, /mia-campaign-banner-actions > \.mia-campaign-banner-button[\s\S]*white-space: normal !important/);
  assert.match(css, /friday-prices[\s\S]*grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
});

test("mobile landmark hero overlays become in-flow content instead of covering a clipped image", () => {
  const aqsa = read("components/minbar/aqsa/AqsaPage.tsx");
  const jerusalem = read("components/minbar/jerusalem/JerusalemPage.tsx");
  const css = read("styles/minbar/minbar.css");
  assert.match(aqsa, /className="aq-mobile-hero"/);
  assert.match(jerusalem, /className="qd-mobile-hero"/);
  assert.match(css, /\.aq-mobile-hero,\.qd-mobile-hero\) > div:last-child[\s\S]*position:relative !important/);
  assert.match(css, /\.aq-mobile-hero,\.qd-mobile-hero\) > img[\s\S]*object-fit:cover !important/);
});
test("phone impact statistics and assistant never turn into oversized clipped rails", () => {
  const css = read("styles/minbar/minbar.css");
  const concierge = read("components/minbar/concierge/ConciergeLauncher.tsx");
  assert.match(css, /\.mia-impact-section \.mia-impact-summary[\s\S]*display:grid !important/);
  assert.match(css, /\.mia-impact-section \.mia-impact-summary > \.mia-impact-stat--featured[\s\S]*grid-column:1\/-1 !important/);
  assert.match(css, /\.cg-launch-wrap\[data-draggable="1"\] \.cg-launcher[\s\S]*width:52px !important/);
  assert.match(concierge, /window\.matchMedia\("\(max-width: 760px\)"\)\.matches/);
});
