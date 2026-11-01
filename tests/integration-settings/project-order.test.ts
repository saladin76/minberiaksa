import assert from "node:assert/strict";
import test from "node:test";
import { mergeProjectPriorityGroups } from "../../lib/minbar/project-order";
import { orderProjectsInCategory } from "../../lib/content-editor/project-order";

test("globally ranked projects precede newest unranked projects and limits preserve that order", () => {
  const prioritized = [{ id: "rank-1" }, { id: "rank-2" }];
  const newest = [{ id: "new-1" }, { id: "new-2" }];
  assert.deepEqual(mergeProjectPriorityGroups(prioritized, newest).map((row) => row.id), [
    "rank-1", "rank-2", "new-1", "new-2",
  ]);
  assert.deepEqual(mergeProjectPriorityGroups(prioritized, newest, 3).map((row) => row.id), [
    "rank-1", "rank-2", "new-1",
  ]);
});

test("category-specific ranks override global priority while missing category ranks keep global order", () => {
  const category = "a".repeat(24), other = "b".repeat(24);
  const globalOrder = [
    { id: "global-priority", categoryPriorities: {} },
    { id: "recent", categoryPriorities: { [category]: 0, [other]: 1 } },
    { id: "unranked", categoryPriorities: null },
    { id: "other-category", categoryPriorities: { [other]: 0 } },
  ];
  const before = JSON.stringify(globalOrder);
  assert.deepEqual(orderProjectsInCategory(globalOrder, category).map(row => row.id), ["recent", "global-priority", "unranked", "other-category"]);
  assert.deepEqual(orderProjectsInCategory(globalOrder, other).map(row => row.id), ["other-category", "recent", "global-priority", "unranked"]);
  assert.equal(JSON.stringify(globalOrder), before);
});
