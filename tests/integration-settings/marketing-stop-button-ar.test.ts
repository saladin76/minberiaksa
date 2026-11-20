import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const route = fs.readFileSync("app/api/templates/whatsapp/[id]/route.ts", "utf8");
test("the Arabic default copy's stop button (at the template root) satisfies the per-language check", () => {
  assert.match(route, /const localeButtons = translation\?\.buttons \?\? \(locale === "ar" \? rootButtons : undefined\);/);
  assert.match(route, /if \(!hasWhatsappUnsubscribeQuickReply\(localeButtons\)\) \{/);
});
test("other languages still need their own stop button", () => {
  assert.doesNotMatch(route, /translation\?\.buttons \?\? rootButtons\)/, "no blanket fallback to the Arabic buttons");
});
