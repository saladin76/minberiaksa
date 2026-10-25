import { openAiFailure } from "../../lib/ai/core/openai-response";
import { providerErrorMessage } from "../../lib/ai/core/provider-error-message";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function service(payload: unknown, capture: unknown[] = []) {
  const source = readFileSync("lib/content-editor/seo-research.ts", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  runInNewContext(code, {
    module: loaded, exports: loaded.exports, Error, Map, Date, AbortSignal,
    process: { env: { OPENAI_API_KEY: "test-key" } },
    fetch: async (_url: string, options: { body: string }) => {
      capture.push(JSON.parse(options.body));
      return { ok: true, json: async () => payload };
    },
    require: (name: string) => {
      if (name === "../ai/core/openai-response") return { openAiFailure };
      if (name === "../ai/core/provider-error-message") return { providerErrorMessage };
      if (name === "server-only") return {};
      if (name === "@/lib/locales") return { isValidLocale: (value: string) => ["ar", "en", "tr"].includes(value) };
      if (name === "@/lib/content-localization/translate") return { LOCALE_ENGLISH_NAMES: { en: "English" } };
      throw new Error("Unexpected dependency: " + name);
    },
  });
  return loaded.exports as { generateResearchedSeo: (input: Record<string, unknown>) => Promise<{ suggestion: { faq: unknown[] }; research: { sources: unknown[] } }> };
}
const input = { type: "campaign", locale: "en", title: "Water project", description: "Clean water for families." };
function response(search = true, sources = true) {
  return { output: [
    ...(search ? [{ type: "web_search_call", status: "completed", action: { sources: sources ? [{ url: "https://example.org/water", title: "Water" }] : [] } }] : []),
    { type: "message", content: [{ type: "output_text", text: JSON.stringify({ seoTitle: "Water project", metaDescription: "Clean water for families.", faq: [{ question: "What does it provide?", answer: "Clean water." }] }) }] },
  ] };
}
test("SEO suggestions require research and return reviewable source evidence", async () => {
  const capture: unknown[] = [];
  const result = await service(response(), capture).generateResearchedSeo(input);
  assert.equal(result.research.sources.length, 1);
  assert.equal(result.suggestion.faq.length, 1);
  assert.equal((capture[0] as { tool_choice: string }).tool_choice, "required");
});
test("SEO never returns a researched suggestion when search did not run", async () => {
  await assert.rejects(service(response(false)).generateResearchedSeo(input), /بحث الويب/);
});
test("SEO requires inspectable sources instead of inventing research evidence", async () => {
  await assert.rejects(service(response(true, false)).generateResearchedSeo(input), /مصادر/);
});
