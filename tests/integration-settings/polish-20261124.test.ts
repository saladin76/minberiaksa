import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (p: string) => fs.readFileSync(p, "utf8");
test("polish 24 Nov: language code in the phone header, assistant bar that wins over the old circle rule, no spacer on checkout", () => {
  assert.match(read("components/minbar/shell/Header.tsx"), /\{locale\.toUpperCase\(\)\}<\/span>/);
  assert.match(read("components/minbar/shell/MobileBottomNav.tsx"), /root\.dataset\.miaFinishingRoute = finishingRoute;/);
  const css = read("styles/minbar/minbar.css");
  assert.match(css, /html body \.mia-scope \.cg-launch-wrap\[data-draggable="1"\] \.cg-launcher-label \{ display: inline !important;/);
  assert.match(css, /html\[data-mia-finishing-route="checkout"\] \.mia-scope::after \{ display: none; \}/);
});
