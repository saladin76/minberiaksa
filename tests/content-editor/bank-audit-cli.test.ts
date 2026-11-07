import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function run(fail = false) {
  const dir = mkdtempSync(join(tmpdir(), "minberi-bank-audit-cli-"));
  const state = join(dir, "state.json");
  const script = resolve("scripts/audit-bank-operations.ts");
  const preload = join(dir, "preload.cjs");
  writeFileSync(preload, `const Module=require('node:module'),fs=require('node:fs');
const original=Module._load,script=${JSON.stringify(script)},state=${JSON.stringify(state)};
Module._load=function(name,parent,...args){
 if(parent?.filename===script){
  if(name==='@next/env')return {loadEnvConfig(){}};
  if(name==='@prisma/client')return {PrismaClient:class{donation={findMany:async()=>{if(${fail})throw Error('private-database-details');return [{provider:'PAYFOR'},{provider:'ALBARAKA'}]}};async $disconnect(){fs.writeFileSync(state,JSON.stringify({disconnected:true}))}}};
  if(name==='../lib/donations/bank-operations-provider')return {bankOperationsReady:()=>({ready:false,reason:'BANK_NOT_CONFIGURED'})};
  if(name==='../lib/donations/bank-operations-service')return {bankDonationSelect:{id:true}};
  if(name==='../lib/donations/bank-operations-core')return {bankBalance:()=>({blocked:false,operations:[]})};
  throw Error('Unexpected audit import: '+name);
 }
 return original.call(this,name,parent,...args);
};`);
  try {
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.startsWith("PAYFOR_")) delete env[key];
    env.PAYFOR_3DPAY_URL = "https://bank.example.test/checkout";
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--require", preload, "--import", "tsx", script], { env, encoding: "utf8", timeout: 30000 });
    assert.equal(result.error, undefined);
    assert.deepEqual(JSON.parse(readFileSync(state, "utf8")), { disconnected: true });
    return result;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("bank audit launches with the documented CJS/tsx command and reports missing PayFor settings without a bank call", () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.readOnly, true);
  assert.equal(report.databaseWrites, 0);
  assert.equal(report.providerCalls, 0);
  assert.deepEqual(report.payfor, { checkoutUrlConfigured: true, operationsUrlConfigured: false, operationsFormatConfigured: false, merchantCredentialsPresent: false });
  assert.equal(report.providers.PAYFOR.reasons.BANK_NOT_CONFIGURED, 1);
});

test("bank audit exits with a safe error and disconnects when its read fails", () => {
  const result = run(true);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Bank operations audit unavailable/);
  assert.doesNotMatch(result.stdout + result.stderr, /private-database-details/);
});
