import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

test("public and preview composition share gallery, related projects and existing history", async () => {
  const calls: string[] = [];
  const loaded = { exports: {} as { getProjectPageContent: (project: unknown, locale: string) => Promise<Record<string, unknown>> } };
  const modules: Record<string, unknown> = {
    "./content/media": { galleryFor: () => ["own-photo", "regional-photo"] },
    "./projects": {
      getProjectDonorCount: async () => { calls.push("count"); return 3; },
      listProjectComments: async () => { calls.push("comments"); return [{ id: "public-comment" }]; },
      listProjectUpdates: async (_id: string, locale: string) => { calls.push("updates:" + locale); return [{ id: "field-update" }]; },
      listRelatedProjects: async () => { calls.push("related"); return [{ id: "selected-child" }]; },
    },
  };
  const source = ts.transpileModule(readFileSync("lib/minbar/project-page-content.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { module: loaded, exports: loaded.exports, require: (key: string) => modules[key] });
  const result = await loaded.exports.getProjectPageContent({ id: "a".repeat(24), images: ["cover", "own-photo"], region: "al-quds" }, "tr");
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { updates: [{ id: "field-update" }], related: [{ id: "selected-child" }], donorCount: 3, comments: [{ id: "public-comment" }], gallery: ["own-photo", "regional-photo"] });
  calls.length = 0;
  const draft = await loaded.exports.getProjectPageContent({ id: "new", images: ["cover", "own-photo"], region: "al-quds" }, "tr");
  assert.deepEqual(calls, ["related"]); assert.equal(draft.donorCount, 0); assert.deepEqual([...draft.gallery as string[]], ["own-photo", "regional-photo"]);
});
