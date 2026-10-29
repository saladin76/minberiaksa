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
  return { dir, app, jobs, sha, env, start, state, until, calls: () => existsSync(join(app, "calls")) ? readFileSync(join(app, "calls"), "utf8") : "" };
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
    assert.equal(f.calls(), "deploy\n");
    writeFileSync(join(f.app, "continue"), "continue");
    assert.equal((await f.until(first, value => terminal.has(value.phase))).phase, "SUCCEEDED");
    assert.equal(f.calls().match(/metadata/g)?.length, 1);
  } finally { rmSync(f.dir, { force: true, recursive: true }); }
});
