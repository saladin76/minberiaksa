import test from "node:test";
import assert from "node:assert/strict";
import { templateSyncTimestamps } from "../../lib/communication/template-sync-timestamps";

test("recently synced variants do not inherit the oldest variant's date", () => {
  const values = ["2026-10-19T12:00:00Z", new Date("2026-10-27T18:00:00Z")];
  const before = [...values];
  assert.deepEqual(templateSyncTimestamps(values), {
    latestAt: "2026-10-27T18:00:00.000Z", oldestAt: "2026-10-19T12:00:00.000Z", complete: true,
  });
  assert.deepEqual(values, before);
});

test("missing or invalid dates retain the actual successful sync with incomplete coverage", () => {
  for (const missing of [null, undefined, "invalid", new Date("invalid")]) {
    assert.deepEqual(templateSyncTimestamps([missing, "2026-10-27T18:00:00Z"]), {
      latestAt: "2026-10-27T18:00:00.000Z", oldestAt: "2026-10-27T18:00:00.000Z", complete: false,
    });
  }
});

test("no saved dates are never presented as a successful sync", () => {
  for (const values of [[], [null, undefined], ["invalid"]]) {
    assert.deepEqual(templateSyncTimestamps(values), { latestAt: null, oldestAt: null, complete: false });
  }
});

test("sync ordering compares instants across timezone offsets", () => {
  assert.deepEqual(templateSyncTimestamps(["2026-10-27T20:00:00+03:00", "2026-10-27T18:00:00Z"]), {
    latestAt: "2026-10-27T18:00:00.000Z", oldestAt: "2026-10-27T17:00:00.000Z", complete: true,
  });
});
