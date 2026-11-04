import test from "node:test";
import assert from "node:assert/strict";
import { localizedAuditFailure, probeLocalizedContent, probeHomepageSeo } from "../../scripts/audit-localized-content.mjs";
import { suggestionFailure } from "../../lib/ai/core/suggestion-failure";
import { OpenAiResponseError } from "../../lib/ai/core/openai-response";

test("the localized provider check does nothing without explicit generation", async () => {
  const fail = async () => { throw new Error("Unexpected provider call"); };
  const result = await probeLocalizedContent({ translate: fail, seo: fail });
  assert.equal(result.status,"generation_not_requested"); assert.equal(result.databaseWrites,0); assert.deepEqual(result.results,[]);
});
test("the live check exercises the production services and fails on lost formatting or empty SEO", async () => {
  let translations=0, research=0;
  const result=await probeLocalizedContent({checkGeneration:true,locales:["ar","en","tr"],
    translate:async(input:{fields:unknown;richFields:Record<string,string>},locale:string)=>{
      translations++; const doc=JSON.parse(input.richFields.description);
      if(locale==="tr")doc.content=[];
      return {fields:{title:"Food parcels"},richFields:{description:JSON.stringify(doc)},warnings:[]};
    },
    seo:async()=>{research++;return {suggestion:{seoTitle:"Food parcels",metaDescription:"Support families"},research:{sources:[{url:"https://example.org"}]}};},
  });
  assert.equal(translations,2); assert.equal(research,2); assert.equal(result.status,"generation_failed");
  assert.equal(result.results[1].seo,"ready"); assert.equal(result.results[2].failure,"LOCALIZED_CONTENT_CHECK_FAILED");
  assert.equal(result.results[2].translation,"failed"); assert.equal(result.results[2].failureStage,"translation");
});

test("the audit reports the failing SEO field and progress while retaining successful languages",async()=>{
  class SeoError extends Error { reason="SEO_FIELD_TOO_LONG"; validation={fields:[{field:"metaDescription",limit:160,actual:174}]}; }
  const progress:unknown[]=[];
  const result=await probeLocalizedContent({checkGeneration:true,locales:["en","tr"],
    translate:async(input:{richFields:Record<string,string>})=>({fields:{title:"Food parcels"},richFields:input.richFields,warnings:[]}),
    seo:async(input:{locale:string})=>{if(input.locale==="en")throw new SeoError("metaDescription exceeds its budget");return {suggestion:{seoTitle:"Food parcels",metaDescription:"Food for families."},research:{sources:[{url:"https://example.org"}]}};},
    describeFailure:(error:unknown)=>localizedAuditFailure(error,{seoError:SeoError,providerFailure:suggestionFailure}),onProgress:(event:unknown)=>progress.push(event),
  });
  assert.equal(result.status,"generation_failed");assert.equal(result.results[0].translation,"ready");assert.equal(result.results[0].seo,"failed");assert.equal(result.results[0].failure,"SEO_FIELD_TOO_LONG");assert.equal(result.results[0].failureStage,"seo");
  assert.deepEqual(result.results[0].validation,{fields:[{field:"metaDescription",limit:160,actual:174}]});assert.equal(result.results[1].seo,"ready");assert.ok(progress.length>=6);
});

test("audit diagnostics never print an arbitrary provider message or secret",()=>{
  class SeoError extends Error {}
  const raw=new Error("Authorization private-key donor@example.test");
  assert.deepEqual(localizedAuditFailure(raw,{seoError:SeoError,providerFailure:suggestionFailure}),{reason:"LOCALIZED_CONTENT_CHECK_FAILED"});
  const provider=new OpenAiResponseError("AI_ACCESS_DENIED");provider.message=raw.message;
  const safe=localizedAuditFailure(provider,{seoError:SeoError,providerFailure:suggestionFailure});
  assert.equal(safe.reason,"AI_ACCESS_DENIED");assert.doesNotMatch(JSON.stringify(safe),/private-key|donor@|Authorization/);
});


test("homepage acceptance requires three complete page-type English runs and preserves an individual failure", async () => {
  const calls: unknown[] = [];
  const seo = async (input: unknown) => { calls.push(input); if (calls.length === 2) throw new Error("SEO_CHECK_FAILED"); return { suggestion: { seoTitle: "Support Al-Quds", metaDescription: "Support the association's projects." }, research: { sources: [{ url: "https://example.org" }] } }; };
  assert.deepEqual(await probeHomepageSeo({ runs: 3, seo }), []);
  const rows = await probeHomepageSeo({ checkGeneration: true, runs: 3, seo, source: {title:"دعم القدس",description:"المصدر العربي الحالي"} });
  assert.deepEqual(rows.map(row => row.status), ["ready", "failed", "ready"]);
  assert.equal(calls.length, 3); assert.deepEqual(calls[0], {type:"page",locale:"en",title:"دعم القدس",description:"المصدر العربي الحالي"});
});
