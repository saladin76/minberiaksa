import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const nav = fs.readFileSync("components/minbar/shell/MobileBottomNav.tsx", "utf8");
const css = fs.readFileSync("styles/minbar/minbar.css", "utf8");
const block = css.slice(css.indexOf("Phones: mobile review 2026-11-21"));
test("floating buttons step aside while scrolling; the bar names its icons", () => {
  assert.match(nav, /root\.dataset\.miaScrolling = "1"/);
  assert.match(nav, /className="mia-mobile-bottom-nav__label"/);
  assert.match(block, /html\[data-mia-scrolling="1"\] \.cg-launch-wrap/);
  assert.match(block, /@media \(max-width: 767px\)/, "phones only");
});
test("only a really open dialog hides the bar (never a closed one kept in the page)", () => {
  assert.doesNotMatch(block, /body:has\(\[role="dialog"\]\)\s/);
  assert.match(block, /\[role="dialog"\]\[data-state="open"\]/);
  assert.match(block, /body\[data-scroll-locked\]/);
  // The assistant sheet stays in the page while closed (aria-hidden, data-open="0"): it must never count as open.
  assert.match(block, /\[aria-modal="true"\]:not\(\[hidden\]\):not\(\[aria-hidden="true"\]\):not\(\[data-open="0"\]\)/);
  assert.equal((block.match(/\{/g) ?? []).length, (block.match(/\}/g) ?? []).length);
});
