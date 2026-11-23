import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (p: string) => fs.readFileSync(p, "utf8");
test("UI/UX batch 1: dead taps lead somewhere", () => {
  const tb = read("components/minbar/banners/TravelBanner.tsx");
  assert.match(tb, /const donateHref = `\$\{href\}#pd-aside`;/); assert.equal((tb.match(/href=\{donateHref\}/g) ?? []).length, 4);
  assert.match(read("components/minbar/shell/Header.tsx"), /window\.scrollTo\(\{ top: 0, behavior: "smooth" \}\); \} \}\} style=\{\{ display: "flex", alignItems: "center", flex: "0 0 auto" \}\}/);
  assert.match(read("components/minbar/zakat/ZakatPage.tsx"), /<a key=\{item\.id\} href="#zk-amounts" className="zk-masraf"/);
  assert.match(read("components/minbar/home/MediaSections.tsx"), /<a key=\{video\.id\} href=\{viewAllHref\} className="mia-reel"/);
  const css = read("styles/minbar/minbar.css");
  assert.match(css, /\.mia-head \.mia-cart::after/); assert.match(css, /div:has\(> \.rc-seg\) \{ flex-wrap: wrap; \}/); assert.match(css, /\.mia-impact-sector > span:has\(> \.mia-impact-sector-value\)/);
});
