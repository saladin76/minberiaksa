import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (p: string) => fs.readFileSync(p, "utf8");
test("Ramadan page: hidden until switched on, every locale has its texts, the bank returns Ramadan plans to it", () => {
  const page = read("app/[locale]/ramadan/page.tsx");
  assert.match(page, /if \(!settings\.enabled && !admin\) notFound\(\);/);
  assert.match(page, /robots: settings\.enabled \? undefined : \{ index: false, follow: false \}/);
  const ar = JSON.parse(read("i18n/messages/ar.json")).ramadan;
  for (const file of fs.readdirSync("i18n/messages").filter((f) => f.endsWith(".json"))) {
    const ns = JSON.parse(read(`i18n/messages/${file}`)).ramadan;
    assert.deepEqual(Object.keys(ns).sort(), Object.keys(ar).sort(), file);
  }
  const ui = read("components/minbar/ramadan/RamadanPage.tsx");
  for (const key of new Set([...ui.matchAll(/\bt\("([a-zA-Z0-9_]+)"/g)].map((m) => m[1]))) assert.ok(key in ar, `missing message ${key}`);
  assert.match(read("app/api/albaraka/3d/callback/route.ts"), /if \(v\?\.frequency === "RAMADAN"\)/);
});
