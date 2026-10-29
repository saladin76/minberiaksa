// VPS release runner: detaches from SSH, serializes releases, records every phase.
// No billing, recipient sends or scheduler execution is performed here.
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const args = process.argv.slice(2), mode = args[0];
const root = resolve(process.env.APP_DIR || process.cwd());
const jobs = resolve(process.env.RELEASE_JOBS_DIR || join(dirname(root), "minberi-release-jobs"));
const stateFile = dir => join(dir, "status.json");
const read = dir => JSON.parse(readFileSync(stateFile(dir), "utf8"));
function save(dir, patch) {
  const state = { ...(existsSync(stateFile(dir)) ? read(dir) : {}), ...patch, updatedAt: new Date().toISOString() };
  const temp = `${stateFile(dir)}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 }); renameSync(temp, stateFile(dir));
  return state;
}
function run(command, argv, cwd = root) {
  const env = { ...process.env }; delete env.APP_DIR;
  const result = spawnSync(command, argv, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status ?? result.signal}`);
}
function nodePath() {
  // Some verification hosts report a basename for execPath. Resolve it through
  // PATH before creating a detached process with a different working directory.
  if (isAbsolute(process.execPath)) return process.execPath;
  const result = spawnSync("which", [process.execPath], { encoding: "utf8" });
  if (result.status !== 0 || !isAbsolute(result.stdout.trim())) throw new Error("Cannot resolve the Node executable.");
  return result.stdout.trim();
}
if (mode === "start") {
  const target = args[1];
  if (!/^[a-f0-9]{40}$/.test(target || "")) throw new Error("Pass the reviewed full commit SHA.");
  if (args.slice(2).some(arg => !["--publish", "--activate-approved"].includes(arg))) throw new Error("Unknown release option.");
  const flock = spawnSync("flock", ["--version"], { encoding: "utf8" });
  if (flock.status !== 0) throw new Error("flock is required to serialize releases on this VPS.");
  if (!existsSync(join(root, ".git"))) throw new Error("APP_DIR must select the existing application checkout.");
  mkdirSync(jobs, { recursive: true, mode: 0o700 });
  const dir = join(jobs, `${new Date().toISOString().replace(/[:.]/g, "-")}-${target.slice(0, 8)}-${process.pid}`);
  mkdirSync(dir, { mode: 0o700 });
  const snapshot = join(dir, "runner.mjs"); copyFileSync(fileURLToPath(import.meta.url), snapshot);
  const options = { target, root, publish: args.includes("--publish"), activate: args.includes("--activate-approved") };
  writeFileSync(join(dir, "options.json"), JSON.stringify(options), { mode: 0o600 });
  save(dir, { target, phase: "STARTING", startedAt: new Date().toISOString(), log: join(dir, "release.log"), paymentCaptures: 0, recipientMessages: 0 });
  const fd = openSync(join(dir, "release.log"), "a", 0o600);
  const child = spawn(nodePath(), [snapshot, "supervise", dir], {
    cwd: root, env: { ...process.env, APP_DIR: root, RELEASE_JOBS_DIR: jobs }, detached: true, stdio: ["ignore", fd, fd],
  });
  await new Promise((accept, reject) => { child.once("spawn", accept); child.once("error", reject); });
  closeSync(fd); child.unref();
  writeFileSync(join(jobs, "latest"), dir + "\n", { mode: 0o600 });
  console.log(JSON.stringify({ ...read(dir), job: dir, supervisorPid: child.pid, note: "Detached from SSH. STARTING is not proof of deployment. Use status to inspect the result." }, null, 2));
} else if (mode === "supervise") {
  const dir = resolve(args[1]);
  save(dir, { supervisorPid: process.pid });
  const result = spawnSync("flock", ["--nonblock", "--conflict-exit-code", "75", join(jobs, "release.lock"), nodePath(), fileURLToPath(import.meta.url), "run", dir], {
    cwd: root, env: process.env, stdio: "inherit",
  });
  const state = read(dir);
  if (result.error || result.status !== 0) save(dir, {
    phase: result.status === 75 ? "BLOCKED_BY_RUNNING_RELEASE" : "FAILED", failedPhase: state.phase,
    exitCode: result.status, finishedAt: new Date().toISOString(),
  });
  process.exitCode = result.status === 0 ? 0 : 1;
} else if (mode === "run") {
  const dir = resolve(args[1]);
  const options = JSON.parse(readFileSync(join(dir, "options.json"), "utf8"));
  try {
    save(dir, { phase: "DEPLOYING" });
    // Read the reviewed wrapper from Git, not a possibly older working tree.
    const wrapper = spawnSync("git", ["show", `${options.target}:scripts/deploy-reviewed-dashboard.sh`], { cwd: options.root, encoding: "utf8" });
    if (wrapper.status !== 0 || !wrapper.stdout.startsWith("#!/usr/bin/env bash")) throw new Error("Reviewed deployment wrapper is unavailable.");
    const script = join(dir, "deploy-reviewed.sh"); writeFileSync(script, wrapper.stdout, { mode: 0o700 });
    const deploy = spawnSync("bash", [script, options.target], { cwd: options.root, env: { ...process.env, APP_DIR: options.root, MINBER_RELEASE_JOB_LOCK_HELD: "1" }, stdio: "inherit" });
    if (deploy.error || deploy.status !== 0) throw new Error("Reviewed deployment did not complete; provider setup was not started.");
    save(dir, { phase: "CONFIGURING_PROVIDERS", runtimeActivated: true });
    run(nodePath(), ["scripts/finalize-reviewed-dashboard.mjs", "--apply", ...(options.publish ? ["--publish"] : []), ...(options.activate ? ["--activate-approved"] : [])], options.root);
    save(dir, { phase: "SUCCEEDED", exitCode: 0, finishedAt: new Date().toISOString(), note: "Deployment and metadata commands completed. Template submission is not Meta approval or proof of message delivery." });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Release job failed.");
    process.exitCode = 1;
  }
} else if (mode === "status") {
  const dir = args[1] ? resolve(args[1]) : readFileSync(join(jobs, "latest"), "utf8").trim();
  const state = read(dir);
  if (!["SUCCEEDED", "FAILED", "BLOCKED_BY_RUNNING_RELEASE"].includes(state.phase) && state.supervisorPid) {
    try { process.kill(state.supervisorPid, 0); } catch { state.phase = "INTERRUPTED"; state.note = "The job process is no longer running. Inspect the log before restarting."; }
  }
  console.log(JSON.stringify({ ...state, job: dir }, null, 2));
} else {
  console.error("Usage: node scripts/release-job.mjs start <reviewed SHA> [--publish] [--activate-approved]\n       node scripts/release-job.mjs status [job-directory]");
  process.exitCode = 1;
}
