import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { seoSourceText } from "../../lib/content-editor/seo-source";
import { contentFieldLimit } from "../../lib/content-editor/contracts";

function fixture(output: unknown = { text: "عنوان مقترح" }, configured = true) {
  let requests = 0;
  const dependencies: Record<string, unknown> = {
    "../ai/core/content-requests": { contentModels: () => ({ translation: "test-model" }) },
    "../ai/core/economical-fetch": { economicalAiFetch: async () => { requests++; return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(output) } }] }) }; } },
    "../ai/core/connection-settings": { getOpenAiRuntime: async () => ({ apiKey: configured ? "synthetic" : null }) },
    "../ai/core/openai-response": { OpenAiResponseError: Error },
    "../content-localization/translate": { LOCALE_ENGLISH_NAMES: { ar: "Arabic" } },
    "./seo-source": { seoSourceText }, "./contracts": { contentFieldLimit },
  };
  const module = { exports: {} as { composeField: (input: unknown) => Promise<string> } };
  const source = ts.transpileModule(fs.readFileSync("lib/content-editor/compose.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(source).runInNewContext({ module, exports: module.exports, process: { env: {} }, AbortSignal,
    require: (name: string) => { if (!(name in dependencies)) throw new Error(name); return dependencies[name]; } });
  const input = { field: { key: "title", label: "العنوان", group: "content" }, locale: "ar", values: { description: "مثال غير مخصص للنشر" }, brief: "عنوان موجز" };
  return { run: (patch = {}) => module.exports.composeField({ ...input, ...patch }), requests: () => requests };
}

test("field drafting returns reviewable text, refuses empty context and has no fallback success", async () => {
  const h = fixture();
  assert.equal(await h.run(), "عنوان مقترح");
  await assert.rejects(() => h.run({ values: {}, brief: "" }), /أضف معلومات/);
  assert.equal(h.requests(), 1);
  await assert.rejects(() => fixture({}, false).run(), /AI_NOT_CONFIGURED/);
  await assert.rejects(() => fixture({ text: "" }).run(), /AI_OUTPUT_INVALID/);
  await assert.rejects(() => fixture({ text: "x".repeat(100000) }).run(), /AI_OUTPUT_INVALID/);
});

test("generated content preserves paragraphs as safe Tiptap text rather than executable markup", async () => {
  const h = fixture({ text: "فقرة أولى\n\nفقرة ثانية <script>alert(1)</script>" });
  const result = JSON.parse(await h.run({ field: { key: "description", label: "المحتوى", rich: true } }));
  assert.equal(result.type, "doc");
  assert.equal(result.content.length, 2);
  assert.equal(result.content[1].content[0].type, "text");
  assert.match(result.content[1].content[0].text, /<script>/);
});
