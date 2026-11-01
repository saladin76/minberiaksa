import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function run(args: string[], mode = "normal") {
  const root = mkdtempSync(join(tmpdir(), "minberi-sending-settings-"));
  try {
    mkdirSync(join(root, "node_modules/@next/env"), { recursive: true });
    writeFileSync(join(root, "package.json"), '{"type":"module"}');
    writeFileSync(join(root, "node_modules/@next/env/package.json"), '{"main":"index.cjs"}');
    writeFileSync(join(root, "node_modules/@next/env/index.cjs"), 'exports.loadEnvConfig=()=>{};');
    copyFileSync("scripts/configure-campaign-sending.mjs", join(root, "configure.mjs"));
    copyFileSync("scripts/settings-command-service.mjs", join(root, "settings-command-service.mjs"));
    writeFileSync(join(root, "settings-command-runtime.mjs"), 'export function ensureSettingsCommandRuntime(){}');
    writeFileSync(join(root, "release-metadata-runtime.mjs"), `
      import assert from 'node:assert/strict';
      const mode=process.env.SENDING_QA_MODE;
      let controls={emergencyStop:true,whatsappMarketingCooldownDays:mode==='zero'?0:7,whatsappMarketingCooldownConfigured:true};
      const tx={communicationGlobalControl:{findUnique:async()=>{if(mode==='read-failed')throw Error('read failed');return controls;},upsert:async({update})=>{if(mode==='write-failed')throw Error('write failed');assert.deepEqual(Object.keys(update).sort(),['updatedBy','whatsappMarketingCooldownConfigured','whatsappMarketingCooldownDays']);controls={...controls,...update};return controls;}},auditLog:{create:async({data})=>{assert.equal(data.metadata.externalCall,false);}}};
      export async function loadReleaseModule(path){
        if(path==='lib/prisma.ts')return {prisma:{...tx,$transaction:async fn=>fn(tx),$disconnect:async()=>{}}};
        throw new Error('Unexpected dependency');
      }
    `);
    return spawnSync(process.execPath, [join(root, "configure.mjs"), ...args], { cwd: root, env: { ...process.env, SENDING_QA_MODE: mode }, encoding: "utf8" });
  } finally { rmSync(root, { recursive: true, force: true }); }
}
test("reviewing the interval performs no change; applying zero preserves the emergency stop", () => {
  const review = run(["--whatsapp-cooldown-days=0"]); assert.equal(review.status, 0, review.stderr);
  assert.equal(JSON.parse(review.stdout).current.whatsappMarketingCooldownDays, 7);
  const applied = run(["--apply", "--whatsapp-cooldown-days=0"]); assert.equal(applied.status, 0, applied.stderr);
  const result = JSON.parse(applied.stdout);
  assert.equal(result.current.whatsappMarketingCooldownDays, 0); assert.equal(result.current.emergencyStop, true);
  assert.equal(result.changed, true); assert.equal(result.recipientMessages + result.providerCalls + result.paymentCalls, 0);
  const again = run(["--apply", "--whatsapp-cooldown-days=0"], "zero"); assert.equal(JSON.parse(again.stdout).changed, false);
});
test("invalid arguments, missing settings and failed writes are explicit failures, never success", () => {
  for (const args of [["--apply"], ["--whatsapp-cooldown-days=-1"], ["--whatsapp-cooldown-days=366"], ["--unknown"]]) assert.notEqual(run(args).status, 0);
  for (const mode of ["read-failed", "write-failed"]) assert.notEqual(run(["--apply", "--whatsapp-cooldown-days=0"], mode).status, 0);
});
