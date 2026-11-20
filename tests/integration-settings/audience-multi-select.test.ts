import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const s = fs.readFileSync("app/(dashboard)/dashboard/communication/campaigns/new/_components/SmartAudienceBuilder.tsx", "utf8");
test("countries, languages, projects and badges are chosen several at a time", () => {
  for (const key of ["countries", "locales", "projectIds", "badgeIds"]) assert.match(s, new RegExp(`selected=\\{value\\.filters\\.${key} \\?\\? \\[\\]\\} onChange=\\{\\(next\\) => setMany\\("${key}", next\\)\\}`), key);
  assert.doesNotMatch(s, /setSingle|countries\?\.\[0\]|locales\?\.\[0\]|projectIds\?\.\[0\]/, "no single-value select left");
});
test("the engine already combines several values (any of them), then AND with the other filters", () => {
  const engine = fs.readFileSync("lib/communication/smart-audience.ts", "utf8");
  assert.match(engine, /where\.countryCode = \{ in: f\.countries \}/);
  assert.match(engine, /campaignId: \{ in: f\.projectIds \}/);
});
