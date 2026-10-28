import test from "node:test";
import assert from "node:assert/strict";
import { maskTickerName } from "../../lib/donations/public-ticker-display";
import { publicTickerEntries } from "../../lib/donations/public-ticker-feed";
import { readSuggestionJson, runSuggestionBatch } from "../../lib/content-editor/suggestion-batch";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as display from "../../lib/donations/public-ticker-display";

test("live source settings save with empty legacy lists and reject malformed values before writing",async()=>{
  let denied=false,reads=0,writes=0;
  const current={showRecentDonations:true,showRegisteredNames:false,donorNames:[],amountRanges:[],minIntervalSeconds:3,maxIntervalSeconds:8};
  const delegate={updateMany:async()=>{writes++;},create:async({data}:{data:unknown})=>{writes++;return {id:"ticker",...(data as object)};},update:async({data}:{data:unknown})=>{writes++;return {id:"ticker",...(data as object)};}};
  const dependencies:Record<string,unknown>={
    "next/cache":{unstable_cache:(fn:unknown)=>fn},"next/server":{NextResponse:{json:(body:unknown,options?:{status?:number})=>({body,status:options?.status||200})}},
    "next-auth":{getServerSession:async()=>({user:{id:"admin"}})},"../auth/[...nextauth]/options":{},"@/lib/dashboard/api-auth":{requireAdminOrDashboardPermission:()=>denied?{status:403}:null},
    "@/lib/audit-log":{auditActorFromDashboardSession:()=>({actorRole:"ADMIN"}),writeAuditLog:async()=>{}},"@/lib/prisma":{prisma:{liveDonationTicker:{findUnique:async()=>{reads++;return current;}},$transaction:async(fn:(db:unknown)=>Promise<unknown>)=>fn({liveDonationTicker:delegate})}},
    "@/lib/donations/public-ticker-feed":{},"@/lib/donations/public-ticker-display":display,
  };
  const loaded={exports:{} as {POST:(request:unknown)=>Promise<{status:number}>;PATCH:(request:unknown)=>Promise<{status:number}>}};
  const source=ts.transpileModule(fs.readFileSync("app/api/live-donation-ticker/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new vm.Script(source).runInNewContext({module:loaded,exports:loaded.exports,console:{error(){}},require:(key:string)=>{if(!(key in dependencies))throw Error(key);return dependencies[key];}});
  const input={showRecentDonations:true,showRegisteredNames:false,donorNames:[],amountRanges:[],minIntervalSeconds:3,maxIntervalSeconds:8};
  assert.equal((await loaded.exports.POST({json:async()=>input})).status,201);
  assert.equal((await loaded.exports.PATCH({json:async()=>({id:"ticker",...input})})).status,200);
  const after=writes;
  assert.equal((await loaded.exports.POST({json:async()=>({...input,donorNames:["Valid",1]})})).status,400);
  assert.equal((await loaded.exports.POST({json:async()=>({...input,showRecentDonations:false})})).status,400);
  assert.equal(writes,after);denied=true;
  assert.equal((await loaded.exports.PATCH({json:async()=>{throw Error("Unauthorized body read");}})).status,403);assert.equal(reads,1);
});

test("public names expose only the outside letters of first and last words, including graphemes",()=>{
  assert.equal(maskTickerName("  محمد أحمد عبد الله  "),"م***د ا***ه");
  assert.equal(maskTickerName("John Middle Smith"),"J***n S***h");
  assert.equal(maskTickerName("Émile"),"É***e");assert.equal(maskTickerName("A"),"***");assert.equal(maskTickerName(null),"***");
});
test("real feed only reads enabled sources and returns masked DTOs without identifying fields",async()=>{
  const calls:Record<string,unknown>[]=[];
  const db={donation:{findMany:async(q:unknown)=>{calls.push({donation:q});return [{id:"private-donation",amount:20,currency:"TRY",paidAt:new Date("2026-10-28T00:00:00Z"),donor:{name:"John Middle Smith"}}];}},user:{findMany:async(q:unknown)=>{calls.push({user:q});return [{id:"private-person",name:"Alice Smith"}];}}} as unknown as Parameters<typeof publicTickerEntries>[0];
  const off=await publicTickerEntries(db,{});assert.deepEqual(off,[]);assert.equal(calls.length,0);
  const result=await publicTickerEntries(db,{showRecentDonations:true,showRegisteredNames:true},new Date("2026-10-28T01:00:00Z"));
  const query=JSON.stringify(calls[0]);assert.match(query,/"status":"PAID"/);assert.match(query,/"paidAt":\{"gte"/);
  assert.equal(result[0].name,"J***n S***h");assert.equal(result[0].currency,"TRY");assert.equal(result[1].amount,null);assert.equal(result[1].source,"COMMUNITY");
  assert.doesNotMatch(JSON.stringify(result),/private-|Middle|John|Alice|email|phone|accessToken/);
});
for(const status of [200,502,504])test(`HTML response ${status} never becomes a raw JSON parse error or an empty proposal`,async()=>{
  let count=0;const errors:unknown[]=[];
  const result=await runSuggestionBatch({targets:["en","fr"],signal:new AbortController().signal,request:async()=>{count++;return readSuggestionJson(new Response("<html>private gateway detail</html>",{status,headers:{"content-type":"text/html"}}),"Fallback");},onSuccess:()=>assert.fail("HTML is not a proposal"),onError:(_locale,error)=>errors.push(error),onProgress:()=>{}});
  assert.equal(count,1);assert.deepEqual(result.skipped,["fr"]);assert.equal(result.sharedFailure,true);assert.doesNotMatch(String(errors[0]),/Unexpected token|private gateway|<html>/);
});
