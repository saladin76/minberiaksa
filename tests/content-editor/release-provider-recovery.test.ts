import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const runner = resolve("scripts/release-job.mjs");
function fixture(options: { changedLock?: boolean; dirty?: boolean; inactive?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "provider-recovery-")), app = join(dir, "app"), jobs = join(dir, "jobs"), previous = join(jobs, "previous");
  for (const child of ["scripts", "lib", "i18n", ".next"]) mkdirSync(join(app, child), { recursive: true });
  mkdirSync(previous, { recursive: true });
  writeFileSync(join(app, "package.json"), JSON.stringify({ engines: { node: "24.x" } }));
  writeFileSync(join(app, "package-lock.json"), '{"lockfileVersion":3}');
  writeFileSync(join(app, "tsconfig.json"), "{}"); writeFileSync(join(app, "lib/marker.ts"), "export const marker='live';");
  writeFileSync(join(app, "i18n/marker.json"), "{}"); writeFileSync(join(app, ".next/runtime"), "existing-runtime");
  const finalizer = (source: string) => `import{appendFileSync}from'node:fs';appendFileSync(process.env.FIXTURE_RECORD,JSON.stringify({source:${JSON.stringify(source)},args:process.argv.slice(2),cwd:process.cwd(),configLoaded:process.env.FIXTURE_PRIVATE_CONFIG==='fixture-secret',appDirRemoved:!process.env.APP_DIR})+'\\n');`;
  writeFileSync(join(app, "scripts/finalize-reviewed-dashboard.mjs"), finalizer("wrong-live-source"));
  const git = (...args: string[]) => {
    const r = spawnSync("git", args, { cwd: app, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.test", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.test" } });
    assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
  };
  git("init"); git("add", "."); git("commit", "-m", "Existing activated application"); const base = git("rev-parse", "HEAD");
  writeFileSync(join(app, "scripts/finalize-reviewed-dashboard.mjs"), finalizer("reviewed-snapshot"));
  if (options.changedLock) writeFileSync(join(app, "package-lock.json"), '{"lockfileVersion":3,"changed":true}');
  git("add", "scripts/finalize-reviewed-dashboard.mjs", "package-lock.json"); git("commit", "-m", "Reviewed metadata-only repair"); const target = git("rev-parse", "HEAD");
  git("checkout", "--detach", base);
  mkdirSync(join(app, "node_modules/@next/env"), { recursive: true }); mkdirSync(join(app, "generated"));
  writeFileSync(join(app, "node_modules/@next/env/index.js"), "exports.loadEnvConfig=()=>{process.env.FIXTURE_PRIVATE_CONFIG='fixture-secret'};");
  writeFileSync(join(previous, "status.json"), JSON.stringify({ target: base, phase: "FAILED", failedPhase: "CONFIGURING_PROVIDERS", runtimeActivated: !options.inactive }));
  if (options.dirty) writeFileSync(join(app, "lib/marker.ts"), "export const marker='operator-edited';");
  const env = { ...process.env, APP_DIR: app, RELEASE_JOBS_DIR: jobs, FIXTURE_RECORD: join(dir, "calls") };
  const launch = (wait = false) => spawnSync(process.execPath, [runner, "recover-providers", target, previous, "--publish", "--activate-approved", ...(wait ? ["--wait"] : [])], { cwd: app, env, encoding: "utf8", timeout: 10_000 });
  const state = (job: string) => JSON.parse(readFileSync(join(job, "status.json"), "utf8"));
  const until = async (job: string) => {
    for (let i = 0; i < 100; i++) { const s = state(job); if (["SUCCEEDED", "FAILED", "BLOCKED_BY_RUNNING_RELEASE"].includes(s.phase)) return s; await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.fail("Metadata recovery did not terminate");
  };
  return { dir, app, base, target, previous, launch, until, git, calls: () => existsSync(join(dir, "calls")) ? readFileSync(join(dir, "calls"), "utf8").trim().split("\n").map(line => JSON.parse(line)) : [] };
}

test("provider recovery runs reviewed source with existing config/dependencies, without replacing the active runtime", async () => {
  const f = fixture();
  try {
    const launch = f.launch(); assert.equal(launch.status, 0, launch.stderr); const job = JSON.parse(launch.stdout).job;
    const result = await f.until(job); assert.equal(result.phase, "SUCCEEDED"); assert.equal(result.metadataOnly, true);
    assert.equal(result.runtimeTarget, f.base); assert.equal(result.target, f.target); assert.equal(result.recoveryOf, f.previous);
    const calls = f.calls(); assert.equal(calls.length, 1); assert.equal(calls[0].source, "reviewed-snapshot");
    assert.equal(calls[0].configLoaded, true); assert.equal(calls[0].appDirRemoved, true);
    assert.deepEqual(calls[0].args, ["--apply", "--steps=gift-templates,notification-templates,greeting-templates", "--publish", "--activate-approved"]);
    assert.equal(calls[0].cwd, join(job, "source")); assert.equal(f.git("rev-parse", "HEAD"), f.base);
    assert.equal(readFileSync(join(f.app, ".next/runtime"), "utf8"), "existing-runtime");
    assert.equal(JSON.parse(readFileSync(join(f.previous, "status.json"), "utf8")).phase, "FAILED", "historical failure must not be rewritten");
    assert.equal(result.paymentCaptures, 0); assert.equal(result.recipientMessages, 0);
    assert.ok(!readFileSync(join(job, "release.log"), "utf8").includes("fixture-secret"));
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

for (const options of [{ changedLock: true }, { dirty: true }]) test(`incompatible metadata recovery stops before provider calls: ${JSON.stringify(options)}`, async () => {
  const f = fixture(options);
  try {
    const launch = f.launch(); assert.equal(launch.status, 0, launch.stderr); const result = await f.until(JSON.parse(launch.stdout).job);
    assert.equal(result.phase, "FAILED"); assert.equal(result.failedPhase, "CONFIGURING_PROVIDERS"); assert.equal(f.calls().length, 0);
    assert.equal(f.git("rev-parse", "HEAD"), f.base); assert.equal(readFileSync(join(f.app, ".next/runtime"), "utf8"), "existing-runtime");
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test("a failed or unactivated application deployment is never treated as metadata-only recovery", () => {
  const f = fixture({ inactive: true });
  try { const launch = f.launch(); assert.notEqual(launch.status, 0); assert.match(launch.stderr, /activated runtime/); assert.equal(f.calls().length, 0); }
  finally { rmSync(f.dir, { recursive: true, force: true }); }
});


test("metadata-only --wait finishes provider recovery without rebuilding or restarting the application", () => {
  const f = fixture();
  try {
    const result = f.launch(true);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /"phase": "SUCCEEDED"/);
    assert.match(result.stdout, /"metadataOnly": true/);
    assert.equal(f.calls().length, 1);
    assert.equal(f.calls()[0].source, "reviewed-snapshot");
    assert.equal(f.git("rev-parse", "HEAD"), f.base);
    assert.equal(readFileSync(join(f.app, ".next/runtime"), "utf8"), "existing-runtime");
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});
