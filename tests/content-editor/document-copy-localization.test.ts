import assert from "node:assert/strict";
import test from "node:test";
import { SUPPORTED_LOCALES } from "../../lib/locales";
import { documentDate } from "../../lib/certificates/date";
import { RECEIPT_LITERAL_DEFAULTS, RECEIPT_PAIR_NOTES, resolveReceiptCopy } from "../../lib/certificates/copy-defaults";

test("numeric dates keep locale order and Latin digits without direction marks inside LTR cells", () => {
  const date = new Date("2026-10-29T12:00:00Z");
  const controls = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/;
  for (const locale of SUPPORTED_LOCALES) {
    const value = documentDate(date, locale);
    assert.ok(!controls.test(value), locale);
    assert.ok(value.includes("2026") && value.includes("10") && value.includes("29"), locale);
  }
  assert.equal(documentDate(date, "ar"), "29/10/2026");
  assert.equal(documentDate(date, "tr"), "29.10.2026");
  assert.equal(documentDate(date, "en"), "10/29/2026");
});

test("receipt pairing note is localized in all 19 languages including persisted legacy seeds", () => {
  assert.deepEqual(Object.keys(RECEIPT_PAIR_NOTES).sort(), [...SUPPORTED_LOCALES].sort());
  for (const locale of SUPPORTED_LOCALES) {
    assert.equal(resolveReceiptCopy({}, undefined, locale).pairNote, RECEIPT_PAIR_NOTES[locale]);
    assert.equal(resolveReceiptCopy({}, { pairNote: RECEIPT_LITERAL_DEFAULTS.pairNote }, locale).pairNote, RECEIPT_PAIR_NOTES[locale]);
    assert.equal(resolveReceiptCopy({}, { pairNote: "Operator wording", legalNote: "Custom legal note" }, locale).pairNote, "Operator wording");
    assert.equal(resolveReceiptCopy({}, { pairNote: RECEIPT_LITERAL_DEFAULTS.pairNote, legalNote: "Custom legal note" }, locale).legalNote, "Custom legal note");
    if (locale !== "tr") assert.notEqual(RECEIPT_PAIR_NOTES[locale], RECEIPT_LITERAL_DEFAULTS.pairNote);
  }
});
