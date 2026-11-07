import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as notifications from "../../lib/dashboard/site-notifications";

type Row=Record<string,unknown>;
function fixture() {
  let allowed=true,reads=0,writes=0,lists=0;const queries:Row[]=[];
  const database={auditLog:{findFirst:async()=>{reads++;return null;},findMany:async(args:Row)=>{reads++;lists++;queries.push(args);return [];},count:async(args:Row)=>{reads++;queries.push(args);return 2;},create:async(args:Row)=>{writes++;queries.push(args);return {}; }},donation:{findMany:async(args:Row)=>{reads++;lists++;queries.push(args);return [];},count:async(args:Row)=>{reads++;queries.push(args);return 3;}}};
  const loaded={exports:{} as {GET:(req:unknown)=>Promise<{status:number;body:Row}>;POST:(req:unknown)=>Promise<{status:number;body:Row}>}};
  const dependencies:Record<string,unknown>={"next/server":{NextResponse:{json:(body:Row,options:{status?:number}={})=>({body,status:options.status||200})}},"next-auth":{getServerSession:async()=>({user:{id:"owner",role:"ADMIN"}})},"@/app/api/auth/[...nextauth]/options":{},"@/lib/dashboard/api-auth":{requireAdminOrDashboardPermission:()=>allowed?null:{status:403}},"@/lib/prisma":{prisma:database},"@/lib/payment-public-origin":{paymentPublicOrigin:()=>"https://example.invalid"},"@/lib/dashboard/site-notifications":notifications};
  const source=ts.transpileModule(readFileSync("app/api/admin/site-notifications/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,{module:loaded,exports:loaded.exports,Date,require:(name:string)=>{assert.ok(name in dependencies,name);return dependencies[name];}});
  return {get:(query="")=>loaded.exports.GET({nextUrl:new URL("https://example.invalid/api?"+query)}),post:(origin="https://example.invalid")=>loaded.exports.POST({url:"https://example.invalid/api",headers:new Headers({origin,"content-type":"application/json"}),json:async()=>({action:"MARK_ALL_READ",actorId:"someone-else"})}),deny:()=>{allowed=false;},stats:()=>({reads,writes,lists}),queries};
}
test("notification permission denial occurs before database reads or writes",async()=>{
  const f=fixture();f.deny();assert.equal((await f.get()).status,403);assert.equal((await f.post()).status,403);assert.deepEqual(f.stats(),{reads:0,writes:0,lists:0});
});
test("notification polling is read-only and excludes team actions and accelerated test payments",async()=>{
  const f=fixture();assert.equal((await f.get()).status,200);assert.equal(f.stats().writes,0);
  assert.deepEqual(notifications.SITE_ACTIVITY_WHERE,{OR:[{stream:"SITE"},{stream:"DONOR",actorRole:"DONOR"}]});
  assert.match(JSON.stringify(f.queries),/subscription_test_cycle/);
  assert.doesNotMatch(JSON.stringify(f.queries),/"metadata":true|"bankOperations":true|"providerRaw":true/);
});
test("the bell reads only counts and marks read under the current account and outside the public feed",async()=>{
  const f=fixture();const result=await f.get("countOnly=1");assert.equal(result.body.unread,5);assert.equal(f.stats().lists,0);
  assert.equal((await f.post("https://foreign.invalid")).status,403);assert.equal(f.stats().writes,0);
  assert.equal((await f.post()).status,200);assert.equal(f.stats().writes,1);
  const record=f.queries.at(-1)?.data as Row;assert.equal(record.actorId,"owner");assert.equal(record.stream,"TEAM");
});
test("cursor validation rejects malformed input before querying activity",async()=>{
  const f=fixture();assert.equal((await f.get("before=not-a-date")).status,400);assert.equal(f.stats().reads,0);
});
test("same-time cursors keep a stable boundary across activity and payments",()=>{
  const at=new Date("2026-11-02T00:00:00Z"),id="a".repeat(24);
  assert.deepEqual(notifications.notificationTimeWhere("createdAt","activity",at,`activity:${id}`),{OR:[{createdAt:{lt:at}},{createdAt:at,id:{lt:id}}]});
  assert.deepEqual(notifications.notificationTimeWhere("paidAt","payment",at,`activity:${id}`),{OR:[{paidAt:{lt:at}},{paidAt:at,id:{in:[]}}]});
});
test("public notification projection never serializes arbitrary private audit or bank fields",()=>{
  const row={id:"a".repeat(24),createdAt:new Date(),action:"CONTACT_MESSAGE",messageAr:"رسالة جديدة",entityType:"Message",entityId:"b".repeat(24),metadata:{secret:"PRIVATE"},providerRaw:"PRIVATE",actorId:"PRIVATE"};
  const item=notifications.siteActivityNotification(row);assert.equal(item.href,"/dashboard/inbox");assert.doesNotMatch(JSON.stringify(item),/PRIVATE|metadata|actorId|providerRaw/);
});
