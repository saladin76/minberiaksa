import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

function auditFunction() {
  const source=readFileSync("scripts/audit-ai-runtime.mjs","utf8").replace(/^#!.*\n/,"").replace('import { pathToFileURL } from "node:url";','').split('if (process.argv[1]')[0].replace('export async function','async function');
  return runInNewContext(source+'\nauditAiRuntime',{AbortSignal,Set,JSON,fetch:()=>{throw new Error("Unexpected external call");}}) as (env:Record<string,string>,options?:{checkGeneration?:boolean;checkResearch?:boolean;request:(url:string,options?:RequestInit)=>Promise<Response>})=>Promise<{generationRequests:number;analysis:{status:string};research:{status:string}}>;
}
test("AI audit does not generate without opt-in and never contacts a custom endpoint",async()=>{
  const urls:string[]=[];const request=async(url:string)=>{urls.push(url);return new Response("{}");};
  const audit=auditFunction();
  const result=await audit({OPENAI_API_KEY:"fixture",AI_CORE_ENABLE_EXTERNAL_CALLS:"true"},{request});
  assert.equal(result.generationRequests,0);assert.equal(urls.length,2);assert.ok(urls.every(url=>url.includes('/models/')));
  urls.length=0;const custom=await audit({OPENAI_API_KEY:"fixture",AI_CORE_OPENAI_BASE_URL:"https://untrusted.example/v1"},{checkGeneration:true,checkResearch:true,request});
  assert.equal(custom.analysis.status,"custom_endpoint_not_probed");assert.equal(urls.length,0);
});
test("AI audit exercises small synthetic generation only and suppresses upstream secrets",async()=>{
  const requests:Array<{url:string;body?:string}>=[];
  const result=await auditFunction()({OPENAI_API_KEY:"private-key",AI_CORE_ENABLE_EXTERNAL_CALLS:"true"},{checkGeneration:true,checkResearch:true,request:async(url,init)=>{
    requests.push({url,body:init?.body as string|undefined});
    if(url.includes('/models/'))return new Response("{}");
    return new Response(JSON.stringify({error:{code:"insufficient_quota",message:"private-key private donor data"}}),{status:429});
  }});
  assert.equal(result.generationRequests,2);assert.equal(result.analysis.status,"generation_failed");
  assert.doesNotMatch(JSON.stringify(result),/private-key|donor data/);
  const payloads=requests.filter(row=>row.body).map(row=>JSON.parse(row.body!));
  assert.ok(payloads.every(row=>row.store===false));
  assert.equal(payloads[1].tools[0].type,"web_search");
});
