import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test("a loading bar during navigation, without a root loading.tsx (404s and redirects stay server-side)", () => {
  assert.match(fs.readFileSync("app/[locale]/layout.tsx", "utf8"), /<NavProgress \/>/);
  assert.equal(fs.existsSync("app/[locale]/loading.tsx"), false);
  const c = fs.readFileSync("components/minbar/shell/NavProgress.tsx", "utf8");
  assert.match(c, /url\.origin !== window\.location\.origin/); assert.match(c, /setTimeout\(\(\) => setState\("idle"\), 15000\)/);
});
