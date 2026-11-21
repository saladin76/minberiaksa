import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const css = fs.readFileSync("styles/dashboard-utilities.css", "utf8");
const block = css.slice(css.indexOf("phone width 2026-11-21"));
test("dashboard pages fit a phone: tab bars scroll, wide content scrolls inside the content area", () => {
  assert.match(block, /@media \(max-width: 767px\)/);
  assert.match(block, /\.dash-vivid \[role="tablist"\] \{ max-width: 100%; overflow-x: auto;/);
  assert.match(block, /\.dash-vivid main > header \+ div \{ max-width: 100vw; overflow-x: auto; \}/);
  assert.equal((block.match(/\{/g) ?? []).length, (block.match(/\}/g) ?? []).length);
});
