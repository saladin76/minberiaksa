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
