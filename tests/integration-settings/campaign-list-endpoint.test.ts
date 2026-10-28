import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";

function endpoint(mode = "ok") {
  let lists = 0, reports = 0;
  const deps: Record<string, unknown> = {
    "next/server": {NextResponse:{json:(body:Record<string,unknown>,options?:{status:number})=>({body,status:options?.status??200})}},
    zod:{z}, "next-auth":{getServerSession:async()=>({user:{id:"operator"}})},
    "@/app/api/auth/[...nextauth]/options":{authOptions:{}},
    "@/lib/dashboard/api-auth":{requireAdminOrDashboardPermission:()=>mode==="denied"?{status:403}:null},
    "@/lib/audit-log":{auditActorFromDashboardSession:()=>({})},
    "@/lib/communication/communication-runtime-types":{COMMUNICATION_CHANNELS:["EMAIL","WHATSAPP","SMS"],COMMUNICATION_PURPOSES:["MARKETING"]},
    "@/lib/communication/campaign-service":{listCampaigns:async()=>{lists++;if(mode==="database")throw new Error("unavailable");return [{id:"campaign",donationCount:999,revenue:999}];}},
    "@/lib/communication/campaign-attribution-service":{getCampaignOutcomeSummary:async()=>{reports++;throw new Error("unavailable");}},
  };
  const code=ts.transpileModule(fs.readFileSync("app/api/communication/campaigns/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const loaded={exports:{} as {GET:(request:unknown)=>Promise<{status:number;body:{ok?:boolean;campaigns?:Array<{donationCount:number|null;revenue:number|null}>}}>}};
  new vm.Script(code).runInNewContext({module:loaded,exports:loaded.exports,Date,require:(id:string)=>{if(!(id in deps))throw new Error(id);return deps[id];}});
  return {get:(query="")=>loaded.exports.GET({nextUrl:new URL("https://example.test/api/communication/campaigns"+query)}),calls:()=>({lists,reports})};
}

test("the fast campaign list does not scan revenue or expose stale stored financial counters",async()=>{
  const h=endpoint();const result=await h.get("?includeOutcomes=false");
  assert.equal(result.status,200);assert.equal(result.body.campaigns?.[0].donationCount,null);assert.equal(result.body.campaigns?.[0].revenue,null);
  assert.deepEqual(h.calls(),{lists:1,reports:0});
});
test("database and attribution failures are unavailable responses rather than empty success",async()=>{
  for(const mode of ["database","financial"]){const h=endpoint(mode);const result=await h.get();assert.equal(result.status,503);assert.equal(result.body.ok,false);assert.equal(result.body.campaigns,undefined);}
});
test("the independent list path preserves authorization before all campaign and financial reads",async()=>{
  const h=endpoint("denied");assert.equal((await h.get("?includeOutcomes=false")).status,403);assert.deepEqual(h.calls(),{lists:0,reports:0});
});
