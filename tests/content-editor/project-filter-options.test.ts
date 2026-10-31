import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { categoryProjectCounts } from "../../lib/campaign/category-project-counts";
import { applyProjectFilterOrder, programmeProjectIds } from "../../lib/minbar/project-filter-options";

test("category counts follow actual memberships and database publication, without stale inverse ids", async () => {
  const queries: unknown[] = [];
  const database = { campaign: { findMany: async (query: unknown) => { queries.push(query); return [{ categoryIds: ["one", "one", "two"], isActive: true }, { categoryIds: ["one"], isActive: false }, { categoryIds: ["one", "one", "two"], isActive: true, isDeleted: true }]; } } } as unknown as Pick<PrismaClient, "campaign">;
  const counts = await categoryProjectCounts(database, ["one", "two", "stale"]);
  assert.deepEqual(counts.get("one"), { published: 1, archived: 1, deleted: 1, total: 2 }); assert.deepEqual(counts.get("two"), { published: 1, archived: 0, deleted: 1, total: 1 }); assert.deepEqual(counts.get("stale"), { published: 0, archived: 0, deleted: 0, total: 0 });
  assert.deepEqual((queries[0] as { select: unknown }).select, { categoryIds: true, isActive: true, isDeleted: true });
  assert.equal(queries.length, 1, "all counts use the same database snapshot");
  await categoryProjectCounts(database, []); assert.equal(queries.length, 1);
});
test("saved ordering mixes both identity kinds, skips removed entries and appends new ones deterministically", () => {
  const rows = [{ key: "category:one", order: 1 }, { key: "programme:one", order: 0 }, { key: "category:new", order: 2 }];
  assert.deepEqual(applyProjectFilterOrder(rows, ["programme:one", "category:one", "category:removed", "programme:one"]).map(row => row.key), ["programme:one", "category:one", "category:new"]);
  assert.deepEqual(rows.map(row => row.key), ["category:one", "programme:one", "category:new"]);
});
test("major-project membership excludes unpublished projects and respects hidden grids and display limits", () => {
  const items = [{ kind: "CAMPAIGN", refId: "one" }, { kind: "CAMPAIGN", refId: "unpublished" }, { kind: "CAMPAIGN", refId: "two" }, { kind: "POST", refId: "article" }], ids = new Set(["one", "two"]);
  assert.deepEqual(programmeProjectIds(items, [], ids), ["one", "two"]);
  assert.deepEqual(programmeProjectIds(items, [{ kind: "CAMPAIGNS", isActive: false, maxItems: null }], ids), []);
  assert.deepEqual(programmeProjectIds(items, [{ kind: "CAMPAIGNS", isActive: true, maxItems: 1 }], ids), ["one"]);
});
