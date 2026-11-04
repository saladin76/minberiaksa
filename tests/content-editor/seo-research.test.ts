import { groundedSeo, seoGroundingFields } from "../../lib/content-editor/seo-grounding";
import { ARABIC_MASTER_LOCALIZATION, researchRequest } from "../../lib/ai/core/content-requests";
import { openAiFailure } from "../../lib/ai/core/openai-response";
import { hasUnexpectedArabicProse } from "../../lib/content-localization/translation-language";
import { seoSourceText } from "../../lib/content-editor/seo-source";
import { missingProtectedTokens } from "../../lib/content-localization/protected-tokens";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function service(payload: unknown, capture: unknown[] = [], repairPayload: unknown = payload, finalPayload: unknown = repairPayload, reviewVerdict?: unknown) {
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
      if (name === "@/lib/ai/core/economical-fetch") return { economicalAiFetch: async (_url: string, options: { body: string }) => {
        const request = JSON.parse(options.body);
        if (request.input?.[0]?.content?.startsWith("SEO_SOURCE_GROUNDING_REVIEW")) {
          const item = JSON.parse(request.input[1].content);
          const verdict = reviewVerdict ?? { checks: item.fields.map((field: {key:string}) => ({key:field.key,supported:true,evidenceQuotes:[item.source]})), relevantSourceUrls: item.sources.map((source:{url:string})=>source.url) };
          return {ok:true,json:async()=>({output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(verdict)}]}]})};
        }
        capture.push(request); return { ok: true, json: async () => capture.length === 1 ? payload : capture.length === 2 ? repairPayload : finalPayload };
      } };
      if (name === "../ai/core/connection-settings") return { getOpenAiRuntime: async () => ({ apiKey: "test-key" }) };
      if (name === "../ai/core/openai-response") return { openAiFailure };
      if (name === "../ai/core/content-requests") return { ARABIC_MASTER_LOCALIZATION, researchRequest };
      if (name === "../content-localization/translation-language") return { hasUnexpectedArabicProse };
      if (name === "./seo-grounding") return { groundedSeo, seoGroundingFields };
      if (name === "./seo-source") return { seoSourceText };
      if (name === "../content-localization/protected-tokens") return { missingProtectedTokens };
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
  assert.equal(failed.length,3);
});

function copyResponse(copy: Record<string, unknown>, search = true) {
  const payload = response(search);
  (payload.output[payload.output.length - 1] as {content:{text:string}[]}).content[0].text = JSON.stringify(copy);
  return payload;
}

test("a long optional field is repaired alone without regenerating healthy English SEO or FAQ", async () => {
  const original = {seoTitle:"Food parcels for Gaza",metaDescription:"Support families with essential food.",altText:"Food parcel for families. ".repeat(10),faq:[{question:"Who benefits?",answer:"Families in need."}]};
  const capture: unknown[]=[];
  const result=await service(copyResponse(original),capture,copyResponse({fields:{altText:"Food parcel for families in Gaza",seoTitle:"Unrequested new title"}},false)).generateResearchedSeo(input);
  const copy=result.suggestion as unknown as typeof original;
  assert.equal(copy.seoTitle,original.seoTitle);assert.equal(copy.metaDescription,original.metaDescription);assert.equal(copy.altText,"Food parcel for families in Gaza");assert.deepEqual(JSON.parse(JSON.stringify(copy.faq)),original.faq);
  const repair=capture[1] as {tools?:unknown;input:{content:string}[]};
  assert.equal(repair.tools,undefined);
  assert.deepEqual(JSON.parse(repair.input[1].content).fields.map((field:{key:string})=>field.key),["altText"]);
  assert.equal(capture.length,2);
});

test("a still-long rewrite gets measured feedback and a tighter target once, then is validated again", async () => {
  const capture: unknown[]=[];
  const result=await service(copyResponse({seoTitle:"Keep this title",metaDescription:"Support families with food. ".repeat(10)}),capture,
    copyResponse({fields:{metaDescription:"Support families with food. ".repeat(7)}},false),
    copyResponse({fields:{metaDescription:"Help families in Gaza access essential food."}},false)).generateResearchedSeo(input);
  assert.equal(capture.length,3);
  const first=JSON.parse((capture[1] as {input:{content:string}[]}).input[1].content).fields[0];
  const second=JSON.parse((capture[2] as {input:{content:string}[]}).input[1].content).fields[0];
  assert.ok(second.actualCharacters>160);assert.ok(second.targetCharacters<first.targetCharacters);
  assert.equal((result.suggestion as unknown as {seoTitle:string}).seoTitle,"Keep this title");
});

test("a shortening repair cannot change a protected price and persistent overflow names its field", async () => {
  const original={seoTitle:"Food parcels",metaDescription:("Help families. ".repeat(15))+"30 USD"};
  const capture:unknown[]=[];
  const result=await service(copyResponse(original),capture,copyResponse({fields:{metaDescription:"Help families with food for 99 USD."}},false),copyResponse({fields:{metaDescription:"Help families with food for 30 USD."}},false)).generateResearchedSeo({...input,description:"Food for 30 USD"});
  assert.match((result.suggestion as unknown as {metaDescription:string}).metaDescription,/30 USD/);assert.equal(capture.length,3);
  await assert.rejects(service(copyResponse(original)).generateResearchedSeo(input),(error:unknown)=>{
    const failure=error as {reason:string;validation:{fields:{field:string;actual:number;limit:number}[]}};
    assert.equal(failure.reason,"SEO_FIELD_TOO_LONG");assert.equal(failure.validation.fields[0].field,"metaDescription");assert.ok(failure.validation.fields[0].actual>failure.validation.fields[0].limit);return true;
  });
});

test("FAQ entries beyond the five-item output limit cannot reject the retained valid questions", async () => {
  const capture:unknown[]=[];
  const faq=Array.from({length:5},()=>({question:"Who benefits?",answer:"Families in need."}));
  const result=await service(copyResponse({seoTitle:"Food parcels",metaDescription:"Support families.",faq:[...faq,{question:"Discarded question ".repeat(30),answer:"Long answer ".repeat(100)}]}),capture).generateResearchedSeo(input);
  assert.equal(result.suggestion.faq.length,5);assert.equal(capture.length,1);
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


test("home-page metadata ignores unused oversized FAQ instead of failing English SEO", async () => {
  const capture: unknown[] = [];
  const result = await service(copyResponse({ seoTitle: "Support Al-Quds and Gaza", metaDescription: "Support the association's projects in Al-Quds and Gaza.", faq: [{question:"Unused",answer:"Unused answer. ".repeat(100)}] }), capture).generateResearchedSeo({...input,type:"page"});
  assert.equal(capture.length, 1); assert.deepEqual(Array.from(result.suggestion.faq), []);
});
test("persistent optional overflow omits the whole optional field after bounded rewrites, preserving the title", async () => {
  const capture: unknown[] = [];
  const result = await service(copyResponse({seoTitle:"Food parcels",metaDescription:"Support food parcels.",altText:"Long optional description. ".repeat(20)}), capture).generateResearchedSeo(input);
  assert.equal(capture.length, 3); assert.equal((result.suggestion as unknown as {altText:string}).altText, "");
});

test("SEO never returns a ready title or description when the independent source review refuses it", async () => {
  await assert.rejects(service(response(), [], response(), response(), {checks:[],relevantSourceUrls:["https://example.org/water"]}).generateResearchedSeo(input), (error:unknown) => (error as {reason:string}).reason === "SEO_SOURCE_UNSUPPORTED");
});
test("the completed service removes an unsupported FAQ before returning the reviewable proposal", async () => {
  const verdict={checks:["seoTitle","metaDescription"].map(key=>({key,supported:true,evidenceQuotes:[input.description]})),relevantSourceUrls:["https://example.org/water"]};
  const result=await service(response(),[],response(),response(),verdict).generateResearchedSeo(input);
  assert.deepEqual(Array.from(result.suggestion.faq),[]);assert.equal(result.research.sources.length,1);
});
test("the completed service refuses sources rejected for topical relevance",async()=>{
  const verdict={checks:["seoTitle","metaDescription"].map(key=>({key,supported:true,evidenceQuotes:[input.description]})),relevantSourceUrls:[]};
  await assert.rejects(service(response(),[],response(),response(),verdict).generateResearchedSeo(input),(error:unknown)=>(error as {reason:string}).reason === "SEO_SOURCES_IRRELEVANT");
});
