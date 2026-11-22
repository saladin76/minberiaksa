import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (p: string) => fs.readFileSync(p, "utf8");
test("owner layout 22 Nov: WhatsApp in the header, assistant as a bar, bottom bar hides while scrolling, three icon-only items", () => {
  const h = read("components/minbar/shell/Header.tsx");
  assert.match(h, /className="mia-circle mia-wa-head"/); assert.match(h, /href=\{`https:\/\/wa\.me\/\$\{ORG\.whatsapp\}`\}/);
  assert.match(read("components/minbar/shell/MobileBottomNav.tsx"), /\["home", "achievementVideos", "account"\]\.includes\(item\.route\) \? null :/);
  const css = read("styles/minbar/minbar.css");
  assert.match(css, /\.mia-wa-fab \{ display: none !important; \}/);
  assert.match(css, /html\[data-mia-scrolling="1"\] \.mia-mobile-bottom-nav \{ translate: 0 140%;/);
  assert.match(css, /\.cg-launch-wrap \.cg-launcher-label \{ display: inline !important; \}/);
});
