import { before, after } from "node:test";
import test from "node:test";
import assert from "node:assert/strict";
import { openAiFailure, openAiResponseText } from "../../lib/ai/core/openai-response";

test("REST response text is extracted across message blocks and tolerates an empty SDK convenience field", () => {
  assert.equal(openAiResponseText({output_text:"",output:[{type:"reasoning"},{type:"message",content:[{type:"output_text",text:"First"},{type:"output_text",text:"second"}]}]}),"First\nsecond");
  assert.equal(openAiResponseText({output_text:"Ready"}),"Ready");
});
test("incomplete, refused and empty model responses cannot masquerade as successful analysis", () => {
  assert.throws(()=>openAiResponseText({status:"incomplete",output_text:'{"summary":'}),/AI_OUTPUT_INCOMPLETE/);
  assert.throws(()=>openAiResponseText({output:[{content:[{type:"refusal",refusal:"reason"}]}]}),/AI_RESPONSE_REFUSED/);
  assert.throws(()=>openAiResponseText({output:[]}),/AI_EMPTY_RESPONSE/);
});
test("provider failures return actionable controlled codes and never echo upstream prompts or credentials", async () => {
  for(const [status,code,expected] of [[400,null,"AI_INVALID_REQUEST"],[401,null,"AI_ACCESS_DENIED"],[403,null,"AI_ACCESS_DENIED"],[404,"model_not_found","AI_MODEL_UNAVAILABLE"],[429,"insufficient_quota","AI_QUOTA_EXCEEDED"],[429,null,"AI_RATE_LIMITED"],[503,null,"AI_PROVIDER_UNAVAILABLE"]] as const){
    const error=await openAiFailure(new Response(JSON.stringify({error:{code,message:"private prompt sk-secret donor@example.test"}}),{status}));
    assert.equal(error.code,expected);
    assert.doesNotMatch(error.message,/secret|donor|private/);
  }
});

test("AI Core consumes an actual REST response instead of reporting a successful fallback", async () => {
  const { generateOpenAiDraft } = await import("../../lib/ai/core/openai-provider");
  const previous = { key: process.env.OPENAI_API_KEY, flag: process.env.AI_CORE_ENABLE_EXTERNAL_CALLS, fetch: globalThis.fetch };
  try {
    process.env.OPENAI_API_KEY="fixture-key";process.env.AI_CORE_ENABLE_EXTERNAL_CALLS="true";
    globalThis.fetch=async()=>new Response(JSON.stringify({status:"completed",output:[{type:"message",content:[{type:"output_text",text:"Verified draft"}]}]}));
    const result=await generateOpenAiDraft({context:{key:"marketing",title:"Fixture",description:"Fixture",systemRole:"Fixture",capabilities:[],allowedSources:[],blockedActions:[],entryHref:"/fixture"},prompt:"Fixture",systemSafety:[]});
    assert.equal(result.status,"COMPLETED");assert.equal(result.mode,"OPENAI");assert.equal(result.answer,"Verified draft");
    globalThis.fetch=async()=>new Response(JSON.stringify({status:"completed",output:[]}));
    assert.equal((await generateOpenAiDraft({context:{key:"marketing",title:"Fixture",description:"Fixture",systemRole:"Fixture",capabilities:[],allowedSources:[],blockedActions:[],entryHref:"/fixture"},prompt:"Fixture",systemSafety:[]})).status,"FAILED");
  } finally {
    if(previous.key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous.key;
    if(previous.flag===undefined)delete process.env.AI_CORE_ENABLE_EXTERNAL_CALLS;else process.env.AI_CORE_ENABLE_EXTERNAL_CALLS=previous.flag;
    globalThis.fetch=previous.fetch;
  }
});

const databaseUrlBeforeFixture = process.env.DATABASE_URL;
before(() => { delete process.env.DATABASE_URL; });
after(() => { if (databaseUrlBeforeFixture === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = databaseUrlBeforeFixture; });
