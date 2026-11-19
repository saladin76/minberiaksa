import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const tr = fs.readFileSync("i18n/messages/tr.json", "utf8");
test("the Turkish receipt names the association (Dernek) and its General Manager", () => {
  assert.match(tr, /"directorLabel": "Genel Müdür"/);
  assert.match(tr, /Tutarlar, derneğin onaylı/);
  assert.doesNotMatch(tr, /Vakıf Müdürü|vakfın onaylı/);
});
test("the receipt's Latin subtitle is stored in capitals, so Turkish casing never turns i into İ", () => {
  assert.match(fs.readFileSync("lib/certificates/copy-defaults.ts", "utf8"), /docTitleLatin: "BAĞIŞ MAKBUZU \/ DONATION RECEIPT"/);
});
