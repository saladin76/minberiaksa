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

test("mobile bottom navigation stays out of payment flows and clears floating actions", () => {
  const nav = read("components/minbar/shell/MobileBottomNav.tsx");
  const css = read("styles/minbar/minbar.css");
  assert.match(nav, /"cart",[\s\S]*"checkout",[\s\S]*"donationSuccess"/);
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
