import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (p: string) => fs.readFileSync(p, "utf8");
test("Clarity 22 Nov: every heavily tapped dead element now responds", () => {
  assert.match(read("styles/minbar/minbar.css"), /\.mia-head \.mia-menu-btn::after \{ content: ""; position: absolute; inset: -8px -10px -18px -10px; \}/);
  const pd = read("components/minbar/projects/ProjectDetail.tsx");
  assert.match(pd, /onClick=\{\(\) => setShowFullSummary\(true\)\}/); assert.match(pd, /\{tCommon\("readMore"\)\}/);
  assert.match(read("components/minbar/projects/ProjectHeroMedia.tsx"), /className="pd-hero-track" onClick=\{\(\) => goTo\(\(active \+ 1\) % images\.length\)\}/);
  assert.match(read("components/minbar/waqf/WaqfPage.tsx"), /<a key=\{aid\.key\} href="#meter-picker" className="wq-aid-card"/);
  const g = read("components/minbar/shell/FieldGallery.tsx"); assert.match(g, /onTouchEnd=/); assert.match(g, /onClick=\{\(\) => \{ if \(images\.length > 1\) step\(1\); \}\}/);
  assert.match(read("components/minbar/shell/MobileBottomNav.tsx"), /if \(active\) \{ e\.preventDefault\(\); window\.scrollTo\(\{ top: 0, behavior: "smooth" \}\); \}/);
});
