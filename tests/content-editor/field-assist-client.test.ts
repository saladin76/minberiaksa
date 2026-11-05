import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

test("new project field assistance sends only the chosen field and leaves values for explicit review", async () => {
  const source = ts.createSourceFile("editor.tsx", fs.readFileSync("components/dashboard/content-editor/ContentEditor.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "suggest") initializer = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!initializer) throw new Error("Missing suggestion handler");
  const executable = ts.transpileModule("globalThis.invoke = " + initializer.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const values = { ar: { title: "", description: "مشروع افتراضي غير مخصص للنشر" } };
  const original = structuredClone(values);
  const calls: Record<string, unknown>[] = [];
  const proposals: unknown[] = [];
  const context = {
    document: { revision: "revision", statuses: {} }, id: "new", kind: "campaigns", uploads: 0, locale: "ar",
    url: "/api/admin/content-editor/campaigns/new", valuesRef: { current: values }, structuredClone, JSON, AbortController,
    fieldBriefs: { "ar:title": "عنوان قصير ومحايد" }, selected: ["title", "description"], analyticsPeriod: null,
    generationAbort: { current: null }, setMessage: () => {}, setBusy: () => {}, setGenerationProgress: () => {},
    setProposal: (value: unknown) => proposals.push(value), dt: (text: string) => text,
    requestSuggestion: async (_url: string, body: Record<string, unknown>) => {
      calls.push(body);
      return { id: "new", kind: "campaigns", revision: "revision", proposals: { ar: { values: { title: "عنوان مقترح" }, warnings: [] } }, errors: {} };
    },
    runSuggestionBatch: async (options: { targets: string[]; request: (target: string) => Promise<unknown>; onSuccess: (target: string, result: unknown) => void }) => {
      for (const target of options.targets) options.onSuccess(target, await options.request(target));
      return { skipped: [], sharedFailure: false };
    },
    invoke: undefined as undefined | ((action: string, all: boolean, locales: string[], field: string) => Promise<void>),
  };
  vm.createContext(context); new vm.Script(executable).runInContext(context);
  await context.invoke!("compose", false, ["ar"], "title");
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].keys)), ["title"]);
  assert.equal(calls[0].brief, "عنوان قصير ومحايد");
  assert.equal(calls[0].field, "title");
  assert.deepEqual(values, original);
  assert.equal(proposals.filter(Boolean).length, 1);
});
