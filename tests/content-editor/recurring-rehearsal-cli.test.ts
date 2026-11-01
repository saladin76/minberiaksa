import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const runId = "3".repeat(24);
async function fixture(args: string[], check: (result: ReturnType<typeof spawnSync>, dir: string) => void | Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), "minberi-rehearsal-cli-")), preload = join(dir, "preload.cjs"), script = resolve("scripts/recurring-rehearsal.ts");
  writeFileSync(preload, `const Module=require('node:module');const original=Module._load;Module._load=function(name,parent,...args){if(parent?.filename===${JSON.stringify(script)}){if(name==='@next/env')return {loadEnvConfig(){}};if(name==='../lib/prisma')return {prisma:{$disconnect:async()=>{}}};if(name==='../lib/donations/recurring-rehearsal')return {runRecurringRehearsal:async options=>({state:options.execute?'COMPLETED':'PREVIEW',runId:options.runId||'${runId}',newCharges:0,readOnly:!options.execute})};if(!name.startsWith('node:'))throw Error('Unexpected dependency');}return original.call(this,name,parent,...args);};`);
  try {
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--require", preload, "--import", "tsx", script, ...args], { encoding: "utf8", timeout: 10000, env: { ...process.env, RECURRING_REHEARSAL_LOG_DIR: join(dir, "logs") } });
    assert.equal(result.error, undefined);
    await check(result, dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const selection = [`--subscription=${"1".repeat(24)}`, `--donor=${"2".repeat(24)}`, "--currency=USD", "--max-total=3.00"];
test("the actual production CLI defaults to a read-only preview under CJS/tsx", async () => fixture(selection, result => {
  assert.equal(result.status, 0, String(result.stderr));
  assert.equal(JSON.parse(String(result.stdout)).state, "PREVIEW");
  assert.equal(JSON.parse(String(result.stdout)).readOnly, true);
}));
test("execution without the preview's exact run ID is rejected", async () => fixture([...selection, "--execute"], result => {
  assert.equal(result.status, 1);
  assert.match(String(result.stderr), /PREVIEW_RUN_ID_REQUIRED/);
}));
test("a detached rehearsal starts its reviewed child and records the eventual result without keeping SSH open", async () => fixture([...selection, "--execute", "--detach", `--run-id=${runId}`], async result => {
  assert.equal(result.status, 0, String(result.stderr));
  const started = JSON.parse(String(result.stdout));
  assert.equal(started.state, "STARTED");
  let log = "";
  for (let attempt = 0; attempt < 50; attempt++) { log = readFileSync(started.log, "utf8"); if (log.includes("COMPLETED")) break; await new Promise(resolve => setTimeout(resolve, 100)); }
  assert.equal(JSON.parse(log).state, "COMPLETED");
}));
