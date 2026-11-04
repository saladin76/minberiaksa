import { ARABIC_MASTER_LOCALIZATION, researchRequest } from "../../lib/ai/core/content-requests";
import { openAiFailure } from "../../lib/ai/core/openai-response";
import { hasUnexpectedArabicProse } from "../../lib/content-localization/translation-language";
import { seoSourceText } from "../../lib/content-editor/seo-source";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function service(payload: unknown, capture: unknown[] = [], repairPayload: unknown = payload) {
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
      if (name === "@/lib/ai/core/economical-fetch") return { economicalAiFetch: async (_url: string, options: { body: string }) => { capture.push(JSON.parse(options.body)); return { ok: true, json: async () => capture.length === 1 ? payload : repairPayload }; } };
      if (name === "../ai/core/connection-settings") return { getOpenAiRuntime: async () => ({ apiKey: "test-key" }) };
      if (name === "../ai/core/openai-response") return { openAiFailure };
      if (name === "../ai/core/content-requests") return { ARABIC_MASTER_LOCALIZATION, researchRequest };
      if (name === "../content-localization/translation-language") return { hasUnexpectedArabicProse };
      if (name === "./seo-source") return { seoSourceText };
      if (name === "server-only") return {};
      if (name === "@/lib/locales") return { isValidLocale: (value: string) => ["ar", "en", "tr"].includes(value) };
      if (name === "@/lib/content-localization/translate") return { LOCALE_ENGLISH_NAMES: { en: "English" } };
      throw new Error("Unexpected dependency: " + name);
    },
  });
  return loaded.exports as {
    generateResearchedSeo: (input: Record<string, unknown>) => Promise<{ suggestion: { faq: unknown[] }; research: { sources: unknown[] } }>;
    generateResearchedArticle: (input: Record<string, unknown>) => Promise<{ values: { content: string }; research: { sources: unknown[] } }>;
  };
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
  assert.equal((capture[0] as { text?: unknown }).text, undefined, "hosted web search must not be combined with JSON mode");
  assert.equal((capture[0] as { store: boolean }).store, false);
});
test("SEO never returns a researched suggestion when search did not run", async () => {
  await assert.rejects(service(response(false)).generateResearchedSeo(input), /بحث الويب/);
});
test("SEO requires inspectable sources instead of inventing research evidence", async () => {
  await assert.rejects(service(response(true, false)).generateResearchedSeo(input), /مصادر/);
});
test("invalid or incomplete research never becomes an apparently valid suggestion", async () => {
  const malformed = response();
  malformed.output[1] = { type: "message", content: [{ type: "output_text", text: "not JSON" }] };
  await assert.rejects(service(malformed).generateResearchedSeo(input), /قراءة نتيجة البحث/);
  await assert.rejects(service({ ...response(), status: "incomplete" }).generateResearchedSeo(input), /لم يكتمل رد البحث/);
});
test("article research uses the same compatible tool contract and preserves cited sources in its draft", async () => {
  const paragraph = "محتوى تجريبي موثّق للمراجعة البشرية دون ادعاءات أو أرقام مختلقة. ".repeat(12);
  const payload = { output: [
    { type: "web_search_call", status: "completed", action: { sources: [{ url: "https://example.org/one", title: "First source" }, { url: "https://example.org/two", title: "Second source" }] } },
    { type: "message", content: [{ type: "output_text", text: JSON.stringify({ title: "مقال للمراجعة", description: "ملخص", blocks: [{ kind: "heading", text: "عنوان" }, { kind: "paragraph", text: paragraph }, { kind: "paragraph", text: paragraph }] }) }] },
  ] };
  const capture: unknown[] = [];
  const result = await service(payload, capture).generateResearchedArticle({ existingTitles: [], sourceContext: "Fixture only" });
  assert.equal((capture[0] as { text?: unknown }).text, undefined);
  assert.equal((capture[0] as { tool_choice: string }).tool_choice, "required");
  assert.equal(result.research.sources.length, 2);
  assert.match(result.values.content, /https:\/\/example.org\/one/);
});

test("SEO targets native search intent from authoritative Arabic and research cannot expand its facts", async () => {
  const capture: unknown[] = [];
  await service(response(), capture).generateResearchedSeo({ type: "campaign", locale: "en", title: "دعم الأسر", description: "دعم الأسر المحتاجة" });
  const prompt = JSON.stringify(capture[0]);
  assert.match(prompt, /Arabic is the authoritative master copy/); assert.match(prompt, /native readers/);
  assert.match(prompt, /never overrides or expands the Arabic source/); assert.match(prompt, /دعم الأسر/);
});

test("foreign SEO cannot silently fall back to an Arabic title or accept leftover Arabic prose", async () => {
  for (const fields of [{seoTitle: "", metaDescription: "Support"}, {seoTitle: "دعم الأسر", metaDescription: "Support families"}]) {
    const payload = response();
    const message = payload.output[payload.output.length - 1] as {content: {text: string}[]};
    message.content[0].text = JSON.stringify(fields);
    await assert.rejects(service(payload).generateResearchedSeo({type: "campaign", locale: "en", title: "دعم الأسر", description: "دعم الأسر"}), /SEO/);
  }
});

test("search commentary cannot hide the final JSON, including split output blocks and quoted braces", async () => {
  const payload = response();
  const answer = JSON.stringify({ seoTitle: "Food {parcels}", metaDescription: "Support families with food." });
  payload.output.splice(1, 0, { type: "message", content: [{ type: "output_text", text: "I will research terminology first." }] });
  payload.output[2] = { type: "message", content: [
    { type: "output_text", text: "Result:\n```json\n" + answer.slice(0, 20) },
    { type: "output_text", text: answer.slice(20) + "\n```\nSources are listed above." },
  ] };
  const capture: unknown[] = [];
  const result = await service(payload, capture).generateResearchedSeo(input);
  assert.equal((result.suggestion as unknown as {seoTitle:string}).seoTitle, "Food {parcels}");
  assert.equal(capture.length, 1);
});

test("prose-only researched output is formatted once in JSON mode without rerunning search", async () => {
  const malformed = response();
  (malformed.output[1] as {content:{text:string}[]}).content[0].text = "Gazze için gıda kolisi bağışı: ihtiyaç sahibi ailelere destek.";
  const repaired = response(false);
  (repaired.output[0] as {content:{text:string}[]}).content[0].text = JSON.stringify({seoTitle:"Gazze için gıda kolisi bağışı",metaDescription:"Gazze'de ihtiyaç sahibi ailelere gıda kolisi ulaştırılmasına destek olun."});
  const capture: unknown[] = [];
  const result = await service(malformed, capture, repaired).generateResearchedSeo({...input,locale:"tr",title:"طرود غذائية",description:"مساعدة الأسر في غزة"});
  assert.equal(capture.length, 2);
  const retry = capture[1] as {text:{format:{type:string}};tools?:unknown;input:unknown};
  assert.equal(retry.text.format.type, "json_object"); assert.equal(retry.tools, undefined);
  assert.match(JSON.stringify(retry.input), /مساعدة الأسر في غزة/);
  assert.equal(result.research.sources.length, 1);
});

test("metadata is rewritten to fit, never cut, and an invalid repair is refused", async () => {
  const oversized = response();
  (oversized.output[1] as {content:{text:string}[]}).content[0].text = JSON.stringify({seoTitle:"Food parcels",metaDescription:"Support families. ".repeat(15)});
  const repaired = response(false);
  (repaired.output[0] as {content:{text:string}[]}).content[0].text = JSON.stringify({seoTitle:"Food parcels",metaDescription:"Support families with essential food parcels."});
  const capture: unknown[] = [];
  const result = await service(oversized,capture,repaired).generateResearchedSeo(input);
  assert.equal(capture.length,2);
  assert.equal((result.suggestion as unknown as {metaDescription:string}).metaDescription,"Support families with essential food parcels.");
  const failed: unknown[] = [];
  await assert.rejects(service(oversized,failed).generateResearchedSeo(input), /حد الحقل/);
  assert.equal(failed.length,2);
});

test("SEO receives the complete readable Arabic document including its final facts", async () => {
  const doc = JSON.stringify({type:"doc",content:[
    {type:"paragraph",content:[{type:"text",text:"محتوى عربي طويل ".repeat(350)}]},
    {type:"heading",attrs:{level:2},content:[{type:"text",text:"أثر المشروع"}]},
    {type:"paragraph",content:[{type:"text",text:"تكلفة الطرد 30 USD وتشمل المواد الغذائية فقط"}]},
  ]});
  const capture: unknown[] = [];
  await service(response(),capture).generateResearchedSeo({...input,description:doc});
  const prompt = JSON.stringify(capture[0]);
  assert.match(prompt,/تكلفة الطرد 30 USD/); assert.doesNotMatch(prompt,/\\"type\\":\\"paragraph\\"/);
  assert.match(prompt,/أثر المشروع/);
  assert.equal(seoSourceText(JSON.stringify({heading:"دعم الأسر",items:["الطعام","الماء"]})),"دعم الأسر\nالطعام\nالماء");
  assert.equal(seoSourceText(JSON.stringify({type:"doc",content:[{type:"paragraph",content:[{type:"text",text:"{{first_name}} 30 USD https://example.org/food_parcels"}]}]})),"{{first_name}} 30 USD https://example.org/food_parcels");
});
