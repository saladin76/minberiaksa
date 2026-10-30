import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const steps = ["setup-paypal-webhook.mjs", "prepare-gift-whatsapp.mjs", "upgrade-notification-templates.mjs", "prepare-document-whatsapp.mjs", "cleanup-retired-templates.mjs", "prepare-greeting-whatsapp.mjs"];
function fixture(broken = false) {
  const root = mkdtempSync(join(tmpdir(), "minberi-metadata-"));
  mkdirSync(join(root, "scripts")); mkdirSync(join(root, "lib/communication"), { recursive: true }); mkdirSync(join(root, "lib/certificates")); mkdirSync(join(root, "lib/donations")); mkdirSync(join(root, "node_modules"));
  for (const file of ["finalize-reviewed-dashboard.mjs", "release-metadata-runtime.mjs"]) cpSync(join("scripts", file), join(root, "scripts", file));
  writeFileSync(join(root, "package.json"), JSON.stringify({ engines: { node: `${process.versions.node.split(".")[0]}.x` } }));
  symlinkSync(resolve("node_modules/tsx"), join(root, "node_modules/tsx"), "dir");
  if (broken) {
    mkdirSync(join(root, "node_modules/server-only"));
    writeFileSync(join(root, "node_modules/server-only/package.json"), JSON.stringify({ name: "server-only", main: "missing.js" }));
    writeFileSync(join(root, "lib/prisma.ts"), 'import "server-only"; export const prisma={$disconnect:async()=>{}}');
  } else writeFileSync(join(root, "lib/prisma.ts"), 'export const prisma={$disconnect:async()=>{}}');
  for (const [file, names] of Object.entries({
    "lib/communication/retired-template-policy.ts": ["retiredTemplateDisposition"],
    "lib/paypal.ts": ["ensurePayPalWebhook"], "lib/communication/meta-template-publisher.ts": ["publishWhatsappTemplateToMeta"],
    "lib/communication/notification-template-upgrade-service.ts": ["prepareNotificationUpgrades", "activateApprovedNotificationUpgrades"],
    "lib/certificates/manual-copy.ts": ["manualDocumentTemplate"], "lib/donations/gift-template-draft.ts": ["giftTemplateBody"], "lib/communication/greeting-template-draft.ts": ["greetingTemplateDraft", "greetingTemplateMatches"],
  })) writeFileSync(join(root, file), names.map(name => `export function ${name}(){}`).join("\n"));
  for (const [index, script] of steps.entries()) writeFileSync(join(root, "scripts", script), `import{appendFileSync}from"node:fs";appendFileSync(${JSON.stringify(join(root, "calls"))},JSON.stringify({step:${index},args:process.argv.slice(2),node:process.versions.node})+"\\n");${index === 1 ? "process.exitCode=7" : ""}`);
  return root;
}

test("standalone server-only dependency is in the production lock and its client guard remains active", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")), lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  assert.equal(pkg.dependencies["server-only"], "0.0.1"); assert.equal(lock.packages[""].dependencies["server-only"], "0.0.1"); assert.equal(lock.packages["node_modules/server-only"].dev, undefined);
  const guarded = spawnSync(process.execPath, ["--input-type=module", "-e", 'await import("server-only")'], { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" } });
  assert.notEqual(guarded.status, 0); assert.match(guarded.stderr, /cannot be imported from a Client Component/);
});

test("the real metadata modules and named exports load outside Next without production DB or provider access", () => {
  const result = spawnSync(process.execPath, ["scripts/finalize-reviewed-dashboard.mjs", "--check-runtime"], { encoding: "utf8", timeout: 60_000, env: { ...process.env, DATABASE_URL: "INVALID_PRODUCTION_URL_MUST_NOT_BE_USED" } });
  assert.equal(result.status, 0, result.stderr); const report = JSON.parse(result.stdout.trim());
  assert.equal(report.runtimeImportsReady, true); assert.equal(report.providerCalls, 0); assert.equal(report.databaseWrites, 0);
});

test("a missing standalone marker stops all setup steps before partial drafts or provider calls", () => {
  const root = fixture(true);
  try {
    const result = spawnSync(process.execPath, [join(root, "scripts/finalize-reviewed-dashboard.mjs"), "--apply", "--publish"], { encoding: "utf8", timeout: 20_000 });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /runtime check failed/); assert.match(result.stderr, /server-only/); assert.equal(existsSync(join(root, "calls")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("metadata retries use the correct Node and flags, attempt every independent step and report a failed step", () => {
  const root = fixture();
  try {
    const result = spawnSync(process.execPath, [join(root, "scripts/finalize-reviewed-dashboard.mjs"), "--apply", "--publish", "--activate-approved"], { encoding: "utf8", timeout: 20_000 });
    assert.equal(result.status, 1, result.stderr);
    const calls = readFileSync(join(root, "calls"), "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.deepEqual(calls.map(call => call.step), [0, 1, 2, 3, 4, 5]); assert.ok(calls.every(call => call.node.split(".")[0] === process.versions.node.split(".")[0]));
    assert.ok(calls[2].args.includes("--activate-approved")); assert.ok(!calls[0].args.includes("--publish"));
    const report = JSON.parse(result.stdout.trim().split("\n").at(-1)!); assert.equal(report.outcomes[1].ok, false); assert.equal(report.outcomes[3].ok, true); assert.equal(report.paymentCaptures, 0); assert.equal(report.recipientMessages, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("selected metadata retries never rerun deployment, cleanup or successful provider steps", () => {
  const root = fixture();
  try {
    const result = spawnSync(process.execPath, [join(root, "scripts/finalize-reviewed-dashboard.mjs"), "--apply", "--publish", "--activate-approved", "--steps=gift-templates,notification-templates,greeting-templates"], { encoding: "utf8", timeout: 20_000 });
    assert.equal(result.status, 1, result.stderr);
    const calls = readFileSync(join(root, "calls"), "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.deepEqual(calls.map(call => call.step), [1, 2, 5]);
    assert.ok(calls.every(call => call.args.includes("--publish")));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a misspelled or empty metadata selector never falls back to running every setup step", () => {
  for (const selector of ["--steps=", "--steps=gift-template", "--steps=gift-templates,gift-templates", "--step=gift-templates"]) {
    const root = fixture();
    try {
      const result = spawnSync(process.execPath, [join(root, "scripts/finalize-reviewed-dashboard.mjs"), "--apply", selector], { encoding: "utf8", timeout: 20_000 });
      assert.notEqual(result.status, 0); assert.match(result.stderr, /metadata (?:step|option)/); assert.equal(existsSync(join(root, "calls")), false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("a Node 22 login shell can select the installed project-engine Node from NVM", () => {
  const root = mkdtempSync(join(tmpdir(), "minberi-node-selector-"));
  try {
    const major = process.versions.node.split(".")[0], bin = join(root, "nvm/versions/node", `v${major}.0.0/bin`);
    mkdirSync(bin, { recursive: true }); writeFileSync(join(bin, "node"), '#!/bin/sh\nexec node "$@"\n', { mode: 0o755 }); writeFileSync(join(root, "package.json"), JSON.stringify({ engines: { node: `${major}.x` } }));
    const code = `import{metadataNodeExecutable}from${JSON.stringify(pathToFileURL(resolve("scripts/release-metadata-runtime.mjs")).href)};Object.defineProperty(process.versions,"node",{value:"22.23.3"});console.log(metadataNodeExecutable(${JSON.stringify(root)}));`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", env: { ...process.env, NVM_DIR: join(root, "nvm") } });
    assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout.trim(), join(bin, "node"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
