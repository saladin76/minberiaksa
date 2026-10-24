import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { mergeProjectPriorityGroups } from "../../lib/minbar/project-order";

test("globally ranked projects precede newest unranked projects and limits preserve that order", () => {
  const source = readFileSync("lib/minbar/projects.ts", "utf8");
  assert.match(source, /NOT: \{ priority: null \}/);
  assert.match(source, /where: unprioritizedWhere,[\s\S]*?orderBy: \{ createdAt: "desc" \}/);

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
  const source = readFileSync("lib/minbar/projects.ts", "utf8");
  assert.match(source, /findPublishedCampaignRows\(locale, \{ categoryId \}\)/);
  assert.match(source, /\.sort\(\(a, b\) => \(a\.rank === b\.rank \? a\.index - b\.index : a\.rank - b\.rank\)\)/);

  const globalOrder = mergeProjectPriorityGroups([{ id: "global-priority" }], [{ id: "recent" }]);
  const categoryOrder = [...globalOrder].sort((a, b) => {
    const rank = (id: string) => id === "recent" ? 0 : Number.POSITIVE_INFINITY;
    return rank(a.id) - rank(b.id);
  });
  assert.deepEqual(categoryOrder.map((row) => row.id), ["recent", "global-priority"]);
});
