// VPS release runner: detaches from SSH, serializes releases, records every phase.
// No billing, recipient sends or scheduler execution is performed here.
// --wait/follow only view the detached job; disconnecting a viewer leaves it running.
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, createReadStream, existsSync, mkdirSync, openSync, closeSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import { StringDecoder } from "node:string_decoder";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const args = process.argv.slice(2), mode = args[0];
const root = resolve(process.env.APP_DIR || process.cwd());
const jobs = resolve(process.env.RELEASE_JOBS_DIR || join(dirname(root), "minberi-release-jobs"));
const stateFile = dir => join(dir, "status.json");
const read = dir => JSON.parse(readFileSync(stateFile(dir), "utf8"));
const terminalPhases = new Set(["SUCCEEDED", "FAILED", "BLOCKED_BY_RUNNING_RELEASE"]);
const recoveryMetadataSteps = ["gift-templates", "notification-templates", "greeting-templates"];
const activeFile = join(jobs, "active");
function recordedJobs() {
  if (!existsSync(jobs)) return [];
  return readdirSync(jobs, { withFileTypes: true }).filter(item => item.isDirectory()).flatMap(item => {
    const dir = join(jobs, item.name);
    try { return [{ dir, state: read(dir) }]; } catch { return []; }
  }).sort((a, b) => String(b.state.startedAt).localeCompare(String(a.state.startedAt)));
}
function matchingJobs(target) { return recordedJobs().filter(entry => entry.state.target === target); }
function procMatchesNodeNamespace() {
  try { return Number(readFileSync("/proc/self/stat", "utf8").split(" ", 1)[0]) === process.pid; }
  catch { return false; }
}
function running(entry) {
  if (terminalPhases.has(entry.state.phase) || !Number.isSafeInteger(entry.state.supervisorPid) || entry.state.supervisorPid <= 0) return false;
  try { process.kill(entry.state.supervisorPid, 0); } catch { return false; }
  // PID numbers can be reused after a long-running job has died. A different
  // process must not keep an interrupted release apparently alive forever.
  // Hosted JS runtimes may virtualize Node PIDs while /proc exposes host PIDs.
  // Do not use that unrelated namespace to pronounce a live job interrupted.
  if (process.platform === "linux" && procMatchesNodeNamespace()) try {
    const argv = readFileSync(`/proc/${entry.state.supervisorPid}/cmdline`, "utf8").split("\0");
    return argv.includes(join(entry.dir, "runner.mjs")) && argv.includes("supervise") && argv.includes(entry.dir);
  } catch (error) {
    if (error?.code === "ENOENT") return false; // Exited between kill(0) and the identity read.
    /* Keep an inaccessible live PID conservative; never force-unlock. */
  }
  return true;
}
function jobAt(dir) {
  if (typeof dir !== "string" || dirname(resolve(dir)) !== jobs) return null;
  try { return { dir: resolve(dir), state: read(resolve(dir)) }; } catch { return null; }
}
function activeJob() {
  try { const entry = jobAt(readFileSync(activeFile, "utf8").trim()); return entry && running(entry) ? entry : null; }
  catch { return null; }
}
function blockersFor(attempt, includeHistorical = true) {
  const recorded = jobAt(attempt.state.blockedBy?.job);
  if (recorded && recorded.dir !== attempt.dir) return { entry: recorded, evidence: "recorded-lock-owner" };
  const active = activeJob();
  // A later unrelated release cannot explain an old blocked attempt.
  const at = Date.parse(attempt.state.finishedAt || attempt.state.startedAt);
  const overlaps = entry => {
    const start = Date.parse(entry.state.startedAt), end = Date.parse(entry.state.finishedAt);
    return entry.dir !== attempt.dir && entry.state.phase !== "BLOCKED_BY_RUNNING_RELEASE" &&
      Number.isFinite(at) && Number.isFinite(start) && start <= at &&
      (Number.isFinite(end) ? end >= at : running(entry));
  };
  if (active && overlaps(active)) return { entry: active, evidence: "active-lock-owner" };
  const candidates = recordedJobs().filter(entry => overlaps(entry) && (includeHistorical || running(entry)));
  return candidates.length === 1 ? { entry: candidates[0], evidence: "overlapping-job-record" } : { candidates };
}
function clearActive(dir) {
  try { if (readFileSync(activeFile, "utf8").trim() === dir) rmSync(activeFile); } catch { /* Status must never release the OS lock. */ }
}
function visibleState(entry) {
  if (!terminalPhases.has(entry.state.phase) && entry.state.supervisorPid && !running(entry)) {
    return { ...entry.state, phase: "INTERRUPTED", note: "The recorded job process is no longer running. Inspect its log before restarting." };
  }
  return entry.state;
}
async function followJob(dir) {
  const log = join(dir, "release.log");
  let offset = 0, decoder = new StringDecoder("utf8"), previousPhase = null;
  const output = async text => {
    if (text && !process.stdout.write(text)) await once(process.stdout, "drain");
  };
  const streamLog = async () => {
    let size;
    try { size = statSync(log).size; }
    catch (error) { if (error?.code === "ENOENT") return; throw error; }
    if (size < offset) { offset = 0; decoder = new StringDecoder("utf8"); }
    if (size === offset) return;
    // Read only the appended bytes. Keep partial UTF-8 characters between polls.
    for await (const chunk of createReadStream(log, { start: offset, end: size - 1 })) {
      offset += chunk.length;
      await output(decoder.write(chunk));
    }
  };
  for (;;) {
    const entry = { dir, state: read(dir) }, state = visibleState(entry);
    if (state.phase !== previousPhase) {
      await output(`\n[release] ${state.phase} — ${dir}\n`);
      previousPhase = state.phase;
    }
    await streamLog();
    if (terminalPhases.has(state.phase) || state.phase === "INTERRUPTED") {
      await output(decoder.end());
      await output("\n" + JSON.stringify({ ...state, job: dir }, null, 2) + "\n");
      process.exitCode = state.phase === "SUCCEEDED" ? 0 : Number.isInteger(state.exitCode) && state.exitCode > 0 ? state.exitCode : 1;
      return;
    }
    await new Promise(accept => setTimeout(accept, 1000));
  }
}
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
if (mode === "start" || mode === "recover-providers") {
  const target = args[1];
  const recovering = mode === "recover-providers";
  if (!/^[a-f0-9]{40}$/.test(target || "")) throw new Error("Pass the reviewed full commit SHA.");
  if (recovering && (!args[2] || args[2].startsWith("--"))) throw new Error("Pass the failed provider-setup job directory.");
  const flags = args.slice(recovering ? 3 : 2);
  if (flags.some(arg => !["--publish", "--activate-approved", "--wait"].includes(arg) && !(recovering && arg.startsWith("--steps=")))) throw new Error("Unknown release option.");
  const selectors = flags.filter(arg => arg.startsWith("--steps="));
  const steps = selectors.length ? selectors[0].slice("--steps=".length).split(",") : recoveryMetadataSteps;
  if (selectors.length > 1 || new Set(steps).size !== steps.length || steps.some(step => !recoveryMetadataSteps.includes(step))) throw new Error("Unknown or duplicate recovery metadata step; nothing was started.");
  const flock = spawnSync("flock", ["--version"], { encoding: "utf8" });
  if (flock.status !== 0) throw new Error("flock is required to serialize releases on this VPS.");
  if (!existsSync(join(root, ".git"))) throw new Error("APP_DIR must select the existing application checkout.");
  let recovery = null;
  if (recovering) {
    const previousJob = resolve(args[2]), previous = read(previousJob);
    if (previous.phase !== "FAILED" || previous.failedPhase !== "CONFIGURING_PROVIDERS" || previous.runtimeActivated !== true || !/^[a-f0-9]{40}$/.test(previous.target || "")) throw new Error("Recovery requires an activated runtime with failed provider setup.");
    recovery = { previousJob, runtimeTarget: previous.target, steps };
  }
  mkdirSync(jobs, { recursive: true, mode: 0o700 });
  // A metadata-only repair may use a newer source SHA while the older runtime
  // stays active. Its success cannot stand in for a full deployment of that SHA.
  const sameRecoveryScope = entry => !recovering || [...(entry.state.metadataSteps ?? recoveryMetadataSteps)].sort().join(",") === [...steps].sort().join(",");
  const existing = matchingJobs(target).find(entry => (entry.state.metadataOnly === true) === recovering && sameRecoveryScope(entry) && running(entry));
  if (existing) {
    console.log(JSON.stringify({ ...existing.state, job: existing.dir, alreadyRunning: true, note: "This commit already has a running release. No second job was started. Inspect this job's status." }, null, 2));
    if (args.includes("--wait")) await followJob(existing.dir);
  } else {
    const dir = join(jobs, `${new Date().toISOString().replace(/[:.]/g, "-")}-${target.slice(0, 8)}-${process.pid}`);
    mkdirSync(dir, { mode: 0o700 });
    const snapshot = join(dir, "runner.mjs"); copyFileSync(fileURLToPath(import.meta.url), snapshot);
    const options = { target, root, publish: args.includes("--publish"), activate: args.includes("--activate-approved"), ...(recovery ? { recovery } : {}) };
    writeFileSync(join(dir, "options.json"), JSON.stringify(options), { mode: 0o600 });
    save(dir, { target, phase: "STARTING", startedAt: new Date().toISOString(), log: join(dir, "release.log"), paymentCaptures: 0, recipientMessages: 0, ...(recovery ? { metadataOnly: true, recoveryOf: recovery.previousJob, runtimeTarget: recovery.runtimeTarget, metadataSteps: recovery.steps, runtimeActivated: true } : {}) });
    const fd = openSync(join(dir, "release.log"), "a", 0o600);
    const child = spawn(nodePath(), [snapshot, "supervise", dir], {
      cwd: root, env: { ...process.env, APP_DIR: root, RELEASE_JOBS_DIR: jobs }, detached: true, stdio: ["ignore", fd, fd],
    });
    await new Promise((accept, reject) => { child.once("spawn", accept); child.once("error", reject); });
    closeSync(fd); child.unref();
    save(dir, { supervisorPid: child.pid });
    writeFileSync(join(jobs, "latest"), dir + "\n", { mode: 0o600 });
    console.log(JSON.stringify({ ...read(dir), job: dir, supervisorPid: child.pid, note: "Detached from SSH. STARTING is not proof of deployment. Use --wait or follow to watch the result." }, null, 2));
    if (args.includes("--wait")) await followJob(dir);
  }
} else if (mode === "follow") {
  if (args.length > 2 || args[1]?.startsWith("--")) throw new Error("Usage: follow [job-directory]");
  const dir = args[1] ? resolve(args[1]) : readFileSync(join(jobs, "latest"), "utf8").trim();
  await followJob(dir);
} else if (mode === "supervise") {
  const dir = resolve(args[1]);
  save(dir, { supervisorPid: process.pid });
  const result = spawnSync("flock", ["--nonblock", "--conflict-exit-code", "75", join(jobs, "release.lock"), nodePath(), fileURLToPath(import.meta.url), "run", dir], {
    cwd: root, env: process.env, stdio: "inherit",
  });
  const state = read(dir);
  const blocker = result.status === 75 ? blockersFor({ dir, state: { ...state, finishedAt: new Date().toISOString() } }, false) : null;
  if (result.error || result.status !== 0) save(dir, {
    phase: result.status === 75 ? "BLOCKED_BY_RUNNING_RELEASE" : "FAILED", failedPhase: state.phase,
    exitCode: result.status, finishedAt: new Date().toISOString(),
    ...(blocker?.entry ? { blockedBy: { job: blocker.entry.dir, target: blocker.entry.state.target, evidence: blocker.evidence } } : {}),
  });
  process.exitCode = result.status === 0 ? 0 : 1;
} else if (mode === "run") {
  const dir = resolve(args[1]);
  const options = JSON.parse(readFileSync(join(dir, "options.json"), "utf8"));
  try {
    // This branch is entered only inside flock. Record the owner across target
    // SHAs so a blocked metadata repair can find the actual deployment job.
    const activeTemp = `${activeFile}.${process.pid}.tmp`;
    writeFileSync(activeTemp, dir + "\n", { mode: 0o600 }); renameSync(activeTemp, activeFile);
    if (options.recovery) {
      save(dir, { phase: "CONFIGURING_PROVIDERS" });
      // A separate source snapshot repairs metadata without changing HEAD, .next,
      // node_modules, PM2 or cron. The normal release lock is held throughout.
      const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: options.root, encoding: "utf8" });
      const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", options.recovery.runtimeTarget, options.target], { cwd: options.root });
      const clean = [[], ["--cached"]].every(flags => spawnSync("git", ["diff", ...flags, "--quiet"], { cwd: options.root }).status === 0);
      if (head.status !== 0 || head.stdout.trim() !== options.recovery.runtimeTarget || ancestor.status !== 0 || !clean) throw new Error("Recovery source does not match the activated runtime; no provider setup started.");
      const snapshot = join(dir, "source"); mkdirSync(snapshot, { mode: 0o700 });
      const archive = spawnSync("git", ["archive", options.target, "scripts", "lib", "i18n", "package.json", "package-lock.json", "tsconfig.json"], { cwd: options.root, maxBuffer: 64 * 1024 * 1024 });
      if (archive.error || archive.status !== 0) throw new Error("Reviewed metadata source snapshot is unavailable.");
      const unpack = spawnSync("tar", ["-x", "-C", snapshot], { input: archive.stdout });
      if (unpack.error || unpack.status !== 0) throw new Error("Cannot prepare the metadata source snapshot.");
      if (readFileSync(join(snapshot, "package-lock.json"), "utf8") !== readFileSync(join(options.root, "package-lock.json"), "utf8")) throw new Error("Metadata recovery requires unchanged dependencies; use a normal release for a dependency change.");
      for (const folder of ["node_modules", "generated"]) {
        if (!existsSync(join(options.root, folder))) throw new Error(`Existing runtime ${folder} is unavailable.`);
        symlinkSync(join(options.root, folder), join(snapshot, folder), "dir");
      }
      createRequire(join(options.root, "package.json"))("@next/env").loadEnvConfig(options.root, false, { info() {}, error() {} });
      run(nodePath(), ["scripts/finalize-reviewed-dashboard.mjs", "--apply", `--steps=${(options.recovery.steps ?? recoveryMetadataSteps).join(",")}`, ...(options.publish ? ["--publish"] : []), ...(options.activate ? ["--activate-approved"] : [])], snapshot);
      save(dir, { phase: "SUCCEEDED", exitCode: 0, finishedAt: new Date().toISOString(), note: "Provider metadata recovery completed. The application runtime was not rebuilt or restarted. Meta approval and message delivery are separate." });
    } else {
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
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Release job failed.");
    process.exitCode = 1;
  } finally { clearActive(dir); }
} else if (mode === "status") {
  if (args[1] === "--all" && args.length === 2) {
    const entries = recordedJobs();
    console.log(JSON.stringify({ readOnly: true, activeJob: activeJob()?.dir ?? null, jobs: entries.map(entry => ({
      job: entry.dir, target: entry.state.target, phase: visibleState(entry).phase,
      recordedPhase: entry.state.phase, metadataOnly: entry.state.metadataOnly === true, metadataSteps: entry.state.metadataSteps,
      runtimeActivated: entry.state.runtimeActivated === true, runtimeTarget: entry.state.runtimeTarget,
      startedAt: entry.state.startedAt, finishedAt: entry.state.finishedAt, log: entry.state.log,
      processRunning: running(entry), blockedBy: entry.state.blockedBy,
    })) }, null, 2));
  } else {
    if (args.length > 2 || args[1]?.startsWith("--")) throw new Error("Usage: status [job-directory] or status --all");
    const requested = args[1] ? resolve(args[1]) : readFileSync(join(jobs, "latest"), "utf8").trim();
    let entry = { dir: requested, state: read(requested) }, latestAttempt = null, evidence = null, candidates = [];
    if (entry.state.phase === "BLOCKED_BY_RUNNING_RELEASE") {
      const blocker = blockersFor(entry);
      if (blocker.entry) {
        latestAttempt = { job: requested, phase: entry.state.phase, target: entry.state.target };
        entry = blocker.entry; evidence = blocker.evidence;
      } else candidates = blocker.candidates || [];
    }
    console.log(JSON.stringify({ ...visibleState(entry), job: entry.dir,
      ...(latestAttempt ? { latestAttempt, followEvidence: evidence, note: "The requested attempt was blocked. This is the current status of its recorded or uniquely overlapping release; targets may differ." } : {}),
      ...(candidates.length ? { blockingCandidates: candidates.map(candidate => ({ job: candidate.dir, target: candidate.state.target, phase: visibleState(candidate).phase })), note: "More than one job overlaps this attempt. No owner was guessed; inspect status --all and the logs." } : {}),
    }, null, 2));
  }
} else {
  console.error("Usage: node scripts/release-job.mjs start <reviewed SHA> [--publish] [--activate-approved] [--wait]\n       node scripts/release-job.mjs recover-providers <reviewed SHA> <failed-job-directory> [--steps=gift-templates,notification-templates,greeting-templates] [--publish] [--activate-approved] [--wait]\n       node scripts/release-job.mjs follow [job-directory]\n       node scripts/release-job.mjs status [job-directory]\n       node scripts/release-job.mjs status --all");
  process.exitCode = 1;
}
