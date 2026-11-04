import test from "node:test";
import assert from "node:assert/strict";
import { probeLocalizedContent } from "../../scripts/audit-localized-content.mjs";

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
});
