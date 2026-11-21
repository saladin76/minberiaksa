import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test("phone review polish: iPhone draws home sections, dashboard fields at 16 px, phone LTR, Arabic plural, contact names", () => {
  assert.match(fs.readFileSync("styles/minbar/minbar.css", "utf8"), /@supports \(-webkit-touch-callout: none\) \{\s*\.mia-scope \.mia-home > section:not\(\.mia-hero\) \{ content-visibility: visible; \}/);
  assert.match(fs.readFileSync("styles/dashboard-utilities.css", "utf8"), /\.dash-vivid select, \.dash-vivid textarea \{ font-size: 16px; \}/);
  assert.match(fs.readFileSync("app/[locale]/profile/_components/EditDialog.tsx", "utf8"), /type === "tel" \? <bdi dir="ltr">\{value\}<\/bdi>/);
  assert.match(fs.readFileSync("i18n/messages/ar.json", "utf8"), /two \{حصلت على وسامين\}/);
  const w = fs.readFileSync("app/(dashboard)/dashboard/communication/conversations/_components/ConversationsWorkspace.tsx", "utf8");
  assert.doesNotMatch(w, /c\.name \|\| c\.phone|active\.name \|\| active\.phone/);
});
