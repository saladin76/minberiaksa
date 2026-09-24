#!/usr/bin/env node
/**
 * TypeScript error ratchet.
 *
 * `next build` runs with type errors ignored (next.config.ts, TSC_COMPILE_ON_ERROR),
 * because the project carries existing errors. That also lets NEW errors ship.
 * This script is phase 1 of removing that bypass:
 *
 *   node scripts/typecheck-baseline.mjs           → fail if any file has more
 *                                                   errors of any code than the
 *                                                   recorded baseline
 *   node scripts/typecheck-baseline.mjs --update  → record the current state
 *
 * The baseline (typecheck-baseline.json) only ever needs to go down. When you fix
 * errors, run with --update so the lower count becomes the new ceiling. When the
 * file is empty, remove `ignoreBuildErrors` and TSC_COMPILE_ON_ERROR.
 *
 * Uses tsconfig.typecheck.json, which leaves out generated `.next` types so the
 * result is the same locally and on Vercel.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const baselinePath = path.join(root, "typecheck-baseline.json");
const update = process.argv.includes("--update");

const require = createRequire(import.meta.url);
const tscBin = require.resolve("typescript/bin/tsc");
const run = spawnSync(process.execPath, [tscBin, "-p", "tsconfig.typecheck.json", "--pretty", "false"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
if (run.error) {
  console.error("typecheck-baseline: could not run tsc:", run.error.message);
  process.exit(2);
}

/** "path(line,col): error TS1234: message" → counts keyed by "path :: TS1234". */
const counts = {};
const pattern = /^(.+?)\(\d+,\d+\): error (TS\d+):/;
for (const line of `${run.stdout}\n${run.stderr}`.split(/\r?\n/)) {
  const m = pattern.exec(line);
  if (!m) continue;
  const key = `${m[1].replace(/\\/g, "/")} :: ${m[2]}`;
  counts[key] = (counts[key] ?? 0) + 1;
}
const total = Object.values(counts).reduce((a, b) => a + b, 0);
// tsc exits non-zero on type errors; any other failure without parsed errors is a real failure.
if (run.status !== 0 && total === 0) {
  console.error("typecheck-baseline: tsc failed without reporting type errors:\n", run.stdout, run.stderr);
  process.exit(2);
}

if (update) {
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(baselinePath, `${JSON.stringify({ total, errors: sorted }, null, 2)}\n`);
  console.log(`typecheck-baseline: recorded ${total} existing error(s) in ${Object.keys(sorted).length} file/code pair(s).`);
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  console.error("typecheck-baseline: no typecheck-baseline.json. Run with --update once to record the current state.");
  process.exit(2);
}
const baseline = JSON.parse(readFileSync(baselinePath, "utf8")).errors ?? {};

const regressions = Object.entries(counts)
  .filter(([key, n]) => n > (baseline[key] ?? 0))
  .map(([key, n]) => ({ key, now: n, allowed: baseline[key] ?? 0 }));
const improved = Object.entries(baseline).filter(([key, n]) => (counts[key] ?? 0) < n).length;

if (regressions.length) {
  console.error(`typecheck-baseline: ${regressions.length} new type error group(s) — not allowed:`);
  for (const r of regressions) console.error(`  ${r.key}: ${r.now} (baseline ${r.allowed})`);
  console.error("\nFix them, or run `npx tsc -p tsconfig.typecheck.json` to see the messages.");
  process.exit(1);
}
console.log(
  `typecheck-baseline: OK — ${total} error(s), none new.` +
    (improved ? ` ${improved} group(s) improved; run with --update to lock in the lower ceiling.` : "")
);
