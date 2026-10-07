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

test("mobile menu reserves the viewport and suppresses floating controls", () => {
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

test("project cards do not show an unlabeled zero raised value beside a real goal", () => {
  const card = read("components/minbar/ProjectDonateCard.tsx");
  assert.match(card, /project\.raised > 0 \? \(/);
});

test("mobile project detail puts the donation panel before optional video content", () => {
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
