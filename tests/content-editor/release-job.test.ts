import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const runner = resolve("scripts/release-job.mjs");
const delay = (ms: number) => new Promise(accept => setTimeout(accept, ms));
const terminal = new Set(["SUCCEEDED", "FAILED", "BLOCKED_BY_RUNNING_RELEASE"]);
function fixture(deployExit = 0, metadataExit = 0, wait = false) {
  const dir = mkdtempSync(join(tmpdir(), "release-job-")), app = join(dir, "app"), jobs = join(dir, "jobs");
  mkdirSync(join(app, "scripts"), { recursive: true });
  cpSync(runner, join(app, "scripts/release-job.mjs"));
  writeFileSync(join(app, "scripts/deploy-reviewed-dashboard.sh"), `#!/usr/bin/env bash\nset -eu\necho deploy >> "$APP_DIR/calls"\n${wait ? 'while [[ ! -f "$APP_DIR/continue" ]]; do sleep 0.1; done' : ""}\nexit ${deployExit}\n`);
  writeFileSync(join(app, "scripts/finalize-reviewed-dashboard.mjs"), `import{appendFileSync}from"node:fs";appendFileSync("calls","metadata "+process.argv.slice(2).join(" ")+"\\n");process.exitCode=${metadataExit};`);
  const git = (...args: string[]) => {
    const out = spawnSync("git", args, { cwd: app, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.test", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.test" } });
    assert.equal(out.status, 0, out.stderr); return out.stdout.trim();
  };
  git("init"); git("add", "."); git("commit", "-m", "Isolated release fixture");
  const sha = git("rev-parse", "HEAD");
  const env = { ...process.env, APP_DIR: app, RELEASE_JOBS_DIR: jobs };
  function start(target = sha) {
    const out = spawnSync(process.execPath, [runner, "start", target, "--publish", "--activate-approved"], { cwd: app, env, encoding: "utf8", timeout: 10_000 });
    assert.equal(out.status, 0, out.stderr); return JSON.parse(out.stdout).job as string;
  }
  const state = (job: string) => JSON.parse(readFileSync(join(job, "status.json"), "utf8"));
  async function until(job: string, predicate: (value: ReturnType<typeof state>) => boolean) {
    for (let attempt = 0; attempt < 100; attempt++) { const value = state(job); if (predicate(value)) return value; await delay(50); }
    assert.fail(`Release fixture did not reach expected phase: ${JSON.stringify(state(job))}`);
  }
  const status = (...args: string[]) => {
    const r = spawnSync(process.execPath, [runner, "status", ...args], { cwd: app, env, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout);
  };
  return { dir, app, jobs, sha, env, start, state, until, status, calls: () => existsSync(join(app, "calls")) ? readFileSync(join(app, "calls"), "utf8") : "" };
}
test("detached release completes after its SSH-like parent receives SIGHUP", async () => {
  const f = fixture(0, 0, true);
  try {
    const shell = spawn("bash", ["-c", 'node "$RUNNER" start "$TARGET" --publish --activate-approved > "$RESULT"; echo ready > "$READY"; while :; do sleep 0.1; done'], { cwd: f.app, env: { ...f.env, RUNNER: runner, TARGET: f.sha, RESULT: join(f.dir, "launch.json"), READY: join(f.dir, "ready") }, stdio: "ignore" });
    for (let i = 0; !existsSync(join(f.dir, "ready")) && i < 100; i++) await delay(50);
    assert.ok(existsSync(join(f.dir, "ready")));
    const job = JSON.parse(readFileSync(join(f.dir, "launch.json"), "utf8")).job;
    await f.until(job, value => value.phase === "DEPLOYING");
    shell.kill("SIGHUP"); writeFileSync(join(f.app, "continue"), "continue");
    const state = await f.until(job, value => terminal.has(value.phase));
    assert.equal(state.phase, "SUCCEEDED"); assert.equal(state.runtimeActivated, true);
    assert.equal(f.calls(), "deploy\nmetadata --apply --publish --activate-approved\n");
    assert.equal(state.paymentCaptures, 0); assert.equal(state.recipientMessages, 0);
  } finally { rmSync(f.dir, { force: true, recursive: true }); }
});
test("a failed deployment never starts provider setup, and a setup failure records an activated runtime", async () => {
  for (const [deployExit, metadataExit] of [[13, 0], [0, 17]]) {
    const f = fixture(deployExit, metadataExit);
    try {
      const job = f.start(), state = await f.until(job, value => terminal.has(value.phase));
      assert.equal(state.phase, "FAILED");
      assert.equal(state.failedPhase, deployExit ? "DEPLOYING" : "CONFIGURING_PROVIDERS");
      assert.equal(f.calls().includes("metadata"), !deployExit);
      assert.equal(state.runtimeActivated === true, !deployExit);
    } finally { rmSync(f.dir, { force: true, recursive: true }); }
  }
});
test("repeating the same commit follows the existing release without creating another job", async () => {
  const f = fixture(0, 0, true);
  try {
    const first = f.start(); await f.until(first, value => value.phase === "DEPLOYING");
    const second = f.start();
    assert.equal(second, first); assert.equal(f.state(first).phase, "DEPLOYING"); assert.equal(f.calls(), "deploy\n");
    writeFileSync(join(f.app, "continue"), "continue");
    assert.equal((await f.until(first, value => terminal.has(value.phase))).phase, "SUCCEEDED");
    assert.equal(f.calls().match(/metadata/g)?.length, 1);
  } finally { rmSync(f.dir, { force: true, recursive: true }); }
});

test("status follows an original release when an older runner left latest pointing at a blocked duplicate", async () => {
  const f = fixture(0, 0, true);
  try {
    const first = f.start(); await f.until(first, value => value.phase === "DEPLOYING");
    const blocked = join(f.jobs, "blocked-duplicate"); mkdirSync(blocked);
    writeFileSync(join(blocked, "status.json"), JSON.stringify({ target: f.sha, phase: "BLOCKED_BY_RUNNING_RELEASE", startedAt: new Date().toISOString() }));
    writeFileSync(join(f.jobs, "latest"), blocked);
    const status = () => {
      const result = spawnSync(process.execPath, [runner, "status"], { cwd: f.app, env: f.env, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout);
    };
    assert.equal(status().job, first); assert.equal(status().phase, "DEPLOYING");
    writeFileSync(join(f.app, "continue"), "continue"); await f.until(first, value => terminal.has(value.phase));
    assert.equal(status().phase, "SUCCEEDED"); assert.equal(status().latestAttempt.phase, "BLOCKED_BY_RUNNING_RELEASE");
  } finally { rmSync(f.dir, { force: true, recursive: true }); }
});

test("different commits still share the deployment and provider setup lock", async () => {
  const f = fixture(0, 0, true);
  try {
    const first = f.start(); await f.until(first, value => value.phase === "DEPLOYING");
    const second = f.start("d".repeat(40));
    assert.equal((await f.until(second, value => terminal.has(value.phase))).phase, "BLOCKED_BY_RUNNING_RELEASE");
    assert.equal(f.state(second).blockedBy.job, first);
    for (const args of [[], [second]]) {
      const current = f.status(...args);
      assert.equal(current.job, first); assert.equal(current.phase, "DEPLOYING");
      assert.equal(current.latestAttempt.target, "d".repeat(40));
    }
    assert.equal(f.calls(), "deploy\n");
    writeFileSync(join(f.app, "continue"), "continue");
    assert.equal((await f.until(first, value => terminal.has(value.phase))).phase, "SUCCEEDED");
    assert.equal(f.calls().match(/metadata/g)?.length, 1);
    assert.equal(f.status(second).phase, "SUCCEEDED");
    assert.equal(f.state(second).phase, "BLOCKED_BY_RUNNING_RELEASE", "status must retain the failed attempt's history");
    assert.ok(!existsSync(join(f.jobs, "active")));
  } finally { rmSync(f.dir, { force: true, recursive: true }); }
});

test("historical blocked jobs follow a different overlapping target, not the newest unrelated release", () => {
  const f = fixture();
  try {
    mkdirSync(f.jobs);
    const record = (name: string, data: Record<string, unknown>) => { const dir = join(f.jobs, name); mkdirSync(dir); writeFileSync(join(dir, "status.json"), JSON.stringify(data)); return dir; };
    const original = record("original", { target: "a".repeat(40), phase: "FAILED", failedPhase: "CONFIGURING_PROVIDERS", runtimeActivated: true, startedAt: "2026-10-30T04:34:56Z", finishedAt: "2026-10-30T04:49:00Z" });
    const blocked = record("blocked", { target: "b".repeat(40), phase: "BLOCKED_BY_RUNNING_RELEASE", startedAt: "2026-10-30T04:42:27Z", finishedAt: "2026-10-30T04:42:28Z" });
    record("unrelated", { target: "c".repeat(40), phase: "SUCCEEDED", startedAt: "2026-10-30T05:00:00Z", finishedAt: "2026-10-30T05:10:00Z" });
    writeFileSync(join(f.jobs, "latest"), blocked);
    const before = readFileSync(join(blocked, "status.json"), "utf8");
    for (const args of [[], [blocked]]) {
      const result = f.status(...args);
      assert.equal(result.job, original); assert.equal(result.phase, "FAILED");
      assert.equal(result.failedPhase, "CONFIGURING_PROVIDERS");
      assert.equal(result.followEvidence, "overlapping-job-record");
    }
    assert.equal(readFileSync(join(blocked, "status.json"), "utf8"), before);
    const all = f.status("--all"); assert.equal(all.readOnly, true); assert.equal(all.jobs.length, 3);
    assert.equal(all.jobs.filter((s: { processRunning: boolean }) => s.processRunning).length, 0);
    assert.ok(!existsSync(join(f.jobs, "release.lock")), "read-only status must not create or remove a lock");
    record("ambiguous", { target: "e".repeat(40), phase: "FAILED", startedAt: "2026-10-30T04:35:00Z", finishedAt: "2026-10-30T04:50:00Z" });
    const ambiguous = f.status(blocked);
    assert.equal(ambiguous.job, blocked); assert.equal(ambiguous.phase, "BLOCKED_BY_RUNNING_RELEASE");
    assert.equal(ambiguous.blockingCandidates.length, 2);
  } finally { rmSync(f.dir, { force: true, recursive: true }); }
});

function viewer(f: ReturnType<typeof fixture>, ...args: string[]) {
  const child = spawn(process.execPath, [runner, ...args], { cwd: f.app, env: f.env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "", errors = "";
  child.stdout.on("data", chunk => { output += chunk.toString(); });
  child.stderr.on("data", chunk => { errors += chunk.toString(); });
  const closed = new Promise<{ code: number | null; signal: string | null }>(accept => child.once("close", (code, signal) => accept({ code, signal })));
  return { child, closed, output: () => output, errors: () => errors };
}
async function waitFor(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await delay(50); }
  assert.fail("Expected viewer progress did not appear");
}
async function cleanViewerFixture(f: ReturnType<typeof fixture>, v: ReturnType<typeof viewer>) {
  if (existsSync(f.app)) writeFileSync(join(f.app, "continue"), "continue");
  const latest = join(f.jobs, "latest");
  if (existsSync(latest)) await f.until(readFileSync(latest, "utf8").trim(), value => terminal.has(value.phase));
  v.child.kill();
  await v.closed;
  rmSync(f.dir, { force: true, recursive: true });
}
test("--wait streams live UTF-8 logs and stays open until its own deployment succeeds", async () => {
  const f = fixture(0, 0, true), v = viewer(f, "start", f.sha, "--publish", "--activate-approved", "--wait");
  try {
    await waitFor(() => existsSync(join(f.jobs, "latest")));
    const job = readFileSync(join(f.jobs, "latest"), "utf8").trim();
    await f.until(job, value => value.phase === "DEPLOYING");
    const text = "x".repeat(65_535) + "تقدم النشر المباشر\n";
    writeFileSync(join(job, "release.log"), text, { flag: "a" });
    await waitFor(() => v.output().includes("تقدم النشر المباشر"));
    assert.equal(v.child.exitCode, null, "viewer must not return while the worker is waiting");
    assert.ok(!v.output().includes("�"), "Arabic must survive stream chunk boundaries");
    writeFileSync(join(f.app, "continue"), "continue");
    assert.equal((await v.closed).code, 0, v.errors());
    assert.match(v.output(), /"phase": "SUCCEEDED"/);
    assert.equal(f.calls(), "deploy\nmetadata --apply --publish --activate-approved\n");
  } finally { await cleanViewerFixture(f, v); }
});
test("--wait attaches to the same running commit without launching another release", async () => {
  const f = fixture(0, 0, true), job = f.start();
  await f.until(job, value => value.phase === "DEPLOYING");
  const v = viewer(f, "start", f.sha, "--wait");
  try {
    await waitFor(() => v.output().includes('"alreadyRunning": true'));
    assert.equal(f.calls(), "deploy\n");
    assert.equal(readFileSync(join(f.jobs, "latest"), "utf8").trim(), job);
    writeFileSync(join(f.app, "continue"), "continue");
    assert.equal((await v.closed).code, 0, v.errors());
    assert.equal(f.calls().match(/deploy/g)?.length, 1);
    assert.equal(f.calls().match(/metadata/g)?.length, 1);
  } finally { await cleanViewerFixture(f, v); }
});
test("disconnecting a waiting viewer leaves deployment running and follow resumes without restarting it", async () => {
  const f = fixture(0, 0, true), v = viewer(f, "start", f.sha, "--wait");
  try {
    await waitFor(() => existsSync(join(f.jobs, "latest")));
    const job = readFileSync(join(f.jobs, "latest"), "utf8").trim();
    await f.until(job, value => value.phase === "DEPLOYING");
    v.child.kill("SIGHUP"); await v.closed;
    assert.equal(f.state(job).phase, "DEPLOYING");
    writeFileSync(join(f.app, "continue"), "continue");
    await f.until(job, value => terminal.has(value.phase));
    const result = spawnSync(process.execPath, [runner, "follow", job], { cwd: f.app, env: f.env, encoding: "utf8", timeout: 10_000 });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /"phase": "SUCCEEDED"/);
    assert.equal(f.calls(), "deploy\nmetadata --apply\n");
  } finally { await cleanViewerFixture(f, v); }
});
test("--wait returns failure for build or provider setup failures, preserving runtime activation evidence", () => {
  for (const [deployExit, metadataExit] of [[13, 0], [0, 17]]) {
    const f = fixture(deployExit, metadataExit);
    try {
      const result = spawnSync(process.execPath, [runner, "start", f.sha, "--wait"], { cwd: f.app, env: f.env, encoding: "utf8", timeout: 10_000 });
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stdout, /"phase": "FAILED"/);
      const state = f.state(readFileSync(join(f.jobs, "latest"), "utf8").trim());
      assert.equal(state.failedPhase, deployExit ? "DEPLOYING" : "CONFIGURING_PROVIDERS");
      assert.equal(state.runtimeActivated === true, !deployExit);
      assert.equal(f.calls().includes("metadata"), !deployExit);
    } finally { rmSync(f.dir, { force: true, recursive: true }); }
  }
});
test("follow is read-only and cannot turn a blocked or interrupted attempt into another release's success", () => {
  const f = fixture();
  try {
    mkdirSync(f.jobs);
    for (const [phase, exitCode, expected] of [["BLOCKED_BY_RUNNING_RELEASE", 75, 75], ["DEPLOYING", null, 1]] as const) {
      const job = join(f.jobs, phase); mkdirSync(job);
      const before = JSON.stringify({ target: f.sha, phase, exitCode, supervisorPid: 999999999 });
      writeFileSync(join(job, "status.json"), before); writeFileSync(join(job, "release.log"), "Saved diagnostic\n");
      const result = spawnSync(process.execPath, [runner, "follow", job], { cwd: f.app, env: f.env, encoding: "utf8", timeout: 10_000 });
      assert.equal(result.status, expected, result.stderr);
      assert.match(result.stdout, /Saved diagnostic/);
      assert.match(result.stdout, new RegExp(phase === "DEPLOYING" ? "INTERRUPTED" : phase));
      assert.equal(readFileSync(join(job, "status.json"), "utf8"), before);
    }
    assert.equal(f.calls(), ""); assert.ok(!existsSync(join(f.jobs, "release.lock")));
  } finally { rmSync(f.dir, { force: true, recursive: true }); }
});

test("a full deployment never treats a running metadata-only job for the same source SHA as its own deployment", async () => {
  const f = fixture(0, 0, true), first = f.start();
  try {
    await f.until(first, value => value.phase === "DEPLOYING");
    writeFileSync(join(first, "status.json"), JSON.stringify({ ...f.state(first), metadataOnly: true, runtimeTarget: "a".repeat(40) }));
    const result = spawnSync(process.execPath, [runner, "start", f.sha, "--wait"], { cwd: f.app, env: f.env, encoding: "utf8", timeout: 10_000 });
    assert.equal(result.status, 75, result.stderr);
    assert.match(result.stdout, /"phase": "BLOCKED_BY_RUNNING_RELEASE"/);
    assert.ok(!result.stdout.includes('"alreadyRunning": true'));
    assert.equal(f.calls(), "deploy\n");
    assert.equal(f.state(first).phase, "DEPLOYING");
  } finally {
    writeFileSync(join(f.app, "continue"), "continue");
    await f.until(first, value => terminal.has(value.phase));
    rmSync(f.dir, { force: true, recursive: true });
  }
});
