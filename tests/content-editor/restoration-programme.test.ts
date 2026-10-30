import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as filtering from "../../lib/minbar/project-filter-options";

function fixture(blocks: Array<{ kind: string; isActive: boolean; maxItems: number | null }>, count = 1) {
  const queries: unknown[] = [];
  const loaded = { exports: {} as { getRestorationProgrammeProjectIds: () => Promise<string[] | undefined> } };
  const source = ts.transpileModule(readFileSync("lib/minbar/restoration-programme.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const modules: Record<string, unknown> = {
    "./project-filter-options": filtering,
    "@/lib/prisma": { prisma: { superCategory: { findMany: async (query: unknown) => { queries.push(query); return Array.from({ length: count }, () => ({ items: [{ kind: "CAMPAIGN", refId: "first" }, { kind: "CAMPAIGN", refId: "second" }, { kind: "POST", refId: "article" }], blocks })); } } } },
  };
  vm.runInNewContext(source, { module: loaded, exports: loaded.exports, require: (key: string) => modules[key] });
  return { read: loaded.exports.getRestorationProgrammeProjectIds, queries };
}
test("the two historical spellings resolve the active CMS selection without a hardcoded database id", async () => {
  const f = fixture([]); assert.deepEqual([...await f.read() ?? []], ["first", "second"]);
  const query = JSON.stringify(f.queries);
  assert.match(query, /"isActive":true/); assert.match(query, /previousSlugs/);
  assert.match(query, /alquds-home-restoration/); assert.doesNotMatch(query, /6acf2f/);
});
test("a hidden programme grid stays hidden and its explicit limit is respected", async () => {
  assert.deepEqual([...await fixture([{ kind: "CAMPAIGNS", isActive: false, maxItems: null }]).read() ?? []], []);
  assert.deepEqual([...await fixture([{ kind: "CAMPAIGNS", isActive: true, maxItems: 1 }]).read() ?? []], ["first"]);
});
test("absent configuration retains normal related projects; ambiguous configuration cannot silently select one", async () => {
  assert.equal(await fixture([], 0).read(), undefined);
  await assert.rejects(fixture([], 2).read(), /AMBIGUOUS/);
});
