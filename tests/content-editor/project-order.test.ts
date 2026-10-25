import test from "node:test";
import assert from "node:assert/strict";
import { compareProjectOrder } from "../../lib/content-editor/project-order";

test("an explicit zero priority sorts before an unranked newer project", () => {
  const ranked = { id: "a", priority: 0, createdAt: "2026-01-01" };
  const unranked = { id: "b", priority: null, createdAt: "2026-10-24" };
  assert.ok(compareProjectOrder(ranked, unranked) < 0);
  assert.ok(compareProjectOrder(unranked, ranked) > 0);
});
test("equal priorities and unranked projects use public newest-first ordering", () => {
  const values = [
    { id: "a", priority: null, createdAt: "2026-01-01" },
    { id: "c", priority: 1, createdAt: "2026-10-24" },
    { id: "b", priority: 1, createdAt: "2026-01-01" },
    { id: "d", priority: null, createdAt: "2026-10-24" },
  ].sort(compareProjectOrder);
  assert.deepEqual(values.map((row) => row.id), ["c", "b", "d", "a"]);
});
