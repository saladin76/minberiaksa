/* eslint-disable @typescript-eslint/no-explicit-any -- Fault-injection fixtures deliberately supply partial Prisma clients and VM module exports. */
import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";
import { mkdtempSync, mkdirSync, cpSync, symlinkSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
const servicePromise = import(pathToFileURL(resolve("scripts/settings-command-service.mjs")).href);
const env = { PAYFOR_3DPAY_URL: "https://bank.example/3d", PAYFOR_MBR_ID: "1", PAYFOR_MERCHANT_ID: "fixture", PAYFOR_MERCHANT_PASS: "fixture", PAYFOR_USER_CODE: "fixture", PAYFOR_USER_PASS: "fixture" };
function database(failAudit = false) {
 let state: any = { payment: { id: "fixture", payforEnabled: true, payforSaudiRoutingEnabled: false }, controls: { id: "000000000000000000000001", emergencyStop: true, whatsappMarketingCooldownDays: 7, whatsappMarketingCooldownConfigured: true }, logs: [] };
 const client = (draft: any) => ({ globalSettings: { findFirst: async () => draft.payment, findUnique: async () => draft.payment, update: async ({data}: any) => Object.assign(draft.payment, data) }, communicationGlobalControl: { findUnique: async () => draft.controls, upsert: async ({update}: any) => Object.assign(draft.controls, update) }, auditLog: { create: async ({data}: any) => { if (failAudit) throw new Error("audit unavailable"); draft.logs.push(data); } } });
 const db: any = {};
 for (const name of ["globalSettings", "communicationGlobalControl"]) db[name] = new Proxy({}, {get: (_t, prop) => (...args: any[]) => (client(state) as any)[name][prop](...args)});
 db.$transaction = async (fn: any) => { const draft = structuredClone(state); const value = await fn(client(draft)); state = draft; return value; };
 return { db, state: () => state };
}
test("settings status is read only and a repeated Saudi enable creates no second mutation", async () => {
 const service=await servicePromise; const f=database(); assert.equal((await service.configureSaudiRouting(f.db,"--status",env)).enabled,false); assert.equal(f.state().logs.length,0);
 assert.equal((await service.configureSaudiRouting(f.db,"--enable",env)).changed,true); assert.equal(f.state().payment.payforSaudiRoutingEnabled,true); assert.equal(f.state().logs.length,1);
 assert.equal((await service.configureSaudiRouting(f.db,"--enable",env)).changed,false); assert.equal(f.state().logs.length,1);
});
test("Saudi setting rolls back when the audit insert fails", async () => {
 const service=await servicePromise; const f=database(true); await assert.rejects(service.configureSaudiRouting(f.db,"--enable",env),/audit unavailable/); assert.equal(f.state().payment.payforSaudiRoutingEnabled,false); assert.equal(f.state().logs.length,0);
});
test("PayFor master disable and invalid configuration fail before a write", async () => {
 const service=await servicePromise; const f=database(); f.state().payment.payforEnabled=false; await assert.rejects(service.configureSaudiRouting(f.db,"--enable",env),/master switch/);
 f.state().payment.payforEnabled=true; await assert.rejects(service.configureSaudiRouting(f.db,"--enable",{}),/incomplete/); assert.equal(f.state().payment.payforSaudiRoutingEnabled,false);
});
test("cooldown update commits with its audit and preserves emergency stop", async () => {
 const service=await servicePromise; const f=database(); const before=await service.configureCampaignInterval(f.db,0,false,{}); assert.equal(before.current.whatsappMarketingCooldownDays,7); assert.equal(before.changed,false);
 const result=await service.configureCampaignInterval(f.db,0,true,{}); assert.deepEqual(result.current,{emergencyStop:true,whatsappMarketingCooldownDays:0}); assert.equal(f.state().logs.length,1);
 assert.equal((await service.configureCampaignInterval(f.db,0,true,{})).changed,false); assert.equal(f.state().logs.length,1);
});
test("cooldown audit failure rolls back the interval and never clears the stop", async () => {
 const service=await servicePromise; const f=database(true); await assert.rejects(service.configureCampaignInterval(f.db,0,true,{}),/audit unavailable/); assert.equal(f.state().controls.whatsappMarketingCooldownDays,7); assert.equal(f.state().controls.emergencyStop,true);
});
test("plain node standalone commands bootstrap the project runtime without touching a provider", () => {
 const root=mkdtempSync(join(tmpdir(),"settings-runtime-"));
 try {
  mkdirSync(join(root,"scripts")); mkdirSync(join(root,"lib")); mkdirSync(join(root,"node_modules"));
  for(const name of ["settings-command-runtime.mjs","release-metadata-runtime.mjs","settings-command-service.mjs","configure-saudi-payfor-trial.mjs","configure-campaign-sending.mjs"]) cpSync(resolve("scripts",name),join(root,"scripts",name));
  writeFileSync(join(root,"package.json"),JSON.stringify({engines:{node:"24.x"}}));
  for(const dep of ["tsx","@next"])symlinkSync(resolve("node_modules",dep),join(root,"node_modules",dep),"dir");
  writeFileSync(join(root,"lib/prisma.ts"),'export const prisma={globalSettings:{findFirst:async()=>({id:"fixture",payforEnabled:true,payforSaudiRoutingEnabled:true}),findUnique:async()=>({payforEnabled:true,payforSaudiRoutingEnabled:true})},communicationGlobalControl:{findUnique:async()=>({emergencyStop:false,whatsappMarketingCooldownConfigured:true,whatsappMarketingCooldownDays:0})},$disconnect:async()=>{}};');
  for(const [script,arg]of [["configure-saudi-payfor-trial.mjs","--status"],["configure-campaign-sending.mjs","--whatsapp-cooldown-days=0"]]){
   const r=spawnSync(process.execPath,[join(root,"scripts",script),arg],{cwd:root,encoding:"utf8",timeout:20000}); assert.equal(r.status,0,r.stderr); const result=JSON.parse(r.stdout.trim()); assert.equal(result.readOnly,true); assert.equal(result.changed,false);
  }
 } finally {rmSync(root,{recursive:true,force:true});}
});
