import test from "node:test";
import assert from "node:assert/strict";
import { editorialWeekKey, isDuplicateEditorialTopic } from "../../lib/content-editor/editorial-contracts";
test("weekly keys use ISO weeks across year boundaries in UTC", () => {
  assert.equal(editorialWeekKey(new Date("2027-01-01T23:00:00Z")), "2026-W53");
  assert.equal(editorialWeekKey(new Date("2027-01-04T00:00:00Z")), "2027-W01");
});
test("topic deduplication rejects punctuation, diacritics, and lightly reordered titles", () => {
  const titles = ["دعم التعليم في القدس: أثر المنح الدراسية", "Water access and emergency relief in Gaza"];
  assert.equal(isDuplicateEditorialTopic("دَعْم التعليم في القدس — أثر المنح الدراسية", titles), true);
  assert.equal(isDuplicateEditorialTopic("Emergency relief and water access in Gaza", titles), true);
  assert.equal(isDuplicateEditorialTopic("حماية التراث المعماري في البلدة القديمة", titles), false);
});
