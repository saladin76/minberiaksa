import test from "node:test";
import assert from "node:assert/strict";
import { templateSyncResult } from "../../lib/communication/template-sync-result";
import { templateSyncCoverage } from "../../lib/communication/template-sync-timestamps";

const metadata = { ok: true, variantsUpserted: 192, matchedTemplates: 13, unmatchedNames: ["unmatched_ar", "unmatched_en"] };
const createdAt = new Date("2026-10-27T18:22:00Z");

test("a completed catalogue audit restores counts and unmatched names without exposing extra metadata", () => {
  const result = templateSyncResult({ createdAt, metadata: { ...metadata, token: "private", prompt: "private", nested: { key: "private" } } });
  assert.deepEqual(result, { completedAt: "2026-10-27T18:22:00.000Z", variantsUpserted: 192, matchedTemplates: 13, unmatchedNames: ["unmatched_ar", "unmatched_en"] });
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("failed or malformed audit records never become successful saved results", () => {
  for (const value of [null, [], { ...metadata, ok: false }, { ...metadata, variantsUpserted: -1 }, { ...metadata, matchedTemplates: "13" }, { ...metadata, unmatchedNames: [null] }]) {
    assert.equal(templateSyncResult({ createdAt, metadata: value }), null);
  }
  assert.equal(templateSyncResult({ createdAt: "invalid", metadata }), null);
  assert.equal(templateSyncResult(null), null);
});

test("zero matches remain a real completed sync and repeated unmatched names are deduplicated", () => {
  assert.deepEqual(templateSyncResult({ createdAt, metadata: { ...metadata, matchedTemplates: 0, variantsUpserted: 0, unmatchedNames: ["unmatched_ar", "unmatched_ar"] } })?.unmatchedNames, ["unmatched_ar"]);
});

test("freshness covers hidden templates before the dashboard limits its preview rows", () => {
  const preview = Array.from({ length: 8 }, () => ({ lastSyncedAt: "2026-10-19T12:00:00Z" }));
  const all = [...preview, { lastSyncedAt: null, latestSyncedAt: "2026-10-27T18:22:00Z", oldestSyncedAt: "2026-10-18T12:00:00Z" }];
  assert.equal(templateSyncCoverage(preview).complete, true);
  assert.deepEqual(templateSyncCoverage(all), { latestAt: "2026-10-27T18:22:00.000Z", oldestAt: "2026-10-18T12:00:00.000Z", complete: false });
});
