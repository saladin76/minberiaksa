#!/usr/bin/env node
/**
 * The lint gate.
 *
 * Next 16 removed `next lint`, so `npm run lint` had been failing with "Invalid project directory"
 * for some time, and `eslint.ignoreDuringBuilds` in next.config.ts was silencing a step that no
 * longer existed. Nothing was linting anything. This is the replacement, and it answers two
 * different questions with two different severities:
 *
 *   CRITICAL rules fail the build outright, at any count. These are the ones where a violation is a
 *   defect rather than untidiness: a component referenced but never imported, a non-null assertion on
 *   an optional chain, `Function` as a type, a parse error. There is no reason to carry any of these,
 *   so the ceiling is zero and it stays zero.
 *
 *   Everything else is ratcheted, exactly like `typecheck-baseline.mjs`: the recorded count is a
 *   ceiling that may only fall. The repo carries a few hundred `no-explicit-any` and `no-unused-vars`
 *   findings; blocking the build on those would mean either a week of unrelated edits or turning the
 *   gate off again, and turning it off is how the project got here. A ratchet lets the number go down
 *   without letting it go up.
 *
 *   node scripts/lint-baseline.mjs           check
 *   node scripts/lint-baseline.mjs --update  record the current state as the new ceiling
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const baselinePath = path.join(root, "lint-baseline.json");
const update = process.argv.includes("--update");

/**
 * Rules that fail the build at any count.
 *
 * `null` is ESLint's id for a fatal problem: a parse error, or an unused eslint-disable directive
 * (which means a suppression is lying about what it suppresses). Both are worth stopping for.
 */
const CRITICAL = new Set([
  null,
  "react/jsx-no-undef",
  "@typescript-eslint/no-non-null-asserted-optional-chain",
  "@typescript-eslint/ban-types",
  "@typescript-eslint/no-misused-promises",
  "@typescript-eslint/no-floating-promises",
  "no-dupe-keys",
  "no-dupe-class-members",
  "no-unsafe-negation",
  "no-unreachable",
  "no-cond-assign",
  "valid-typeof",
  "use-isnan",
  "getter-return",
  "no-obj-calls",
  "no-sparse-arrays",
  "require-yield",
]);

/** Linted roots. Excludes generated output and the git-ignored `tmp/` scratch directory. */
const TARGETS = ["app", "components", "lib", "hooks", "i18n", "scripts", "tests", "prisma", "types", "context"];

const require = createRequire(import.meta.url);
const eslintBin = path.join(path.dirname(require.resolve("eslint")), "..", "bin", "eslint.js");
const run = spawnSync(
  process.execPath,
  [eslintBin, ...TARGETS.filter((t) => existsSync(path.join(root, t))), "--format", "json"],
  { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
);

if (run.error) {
  console.error("lint-baseline: could not run eslint:", run.error.message);
  process.exit(2);
}
if (!run.stdout.trim()) {
  console.error("lint-baseline: eslint produced no output.\n", run.stderr);
  process.exit(2);
}

let report;
try {
  report = JSON.parse(run.stdout);
} catch (error) {
  console.error("lint-baseline: could not parse eslint output:", error.message);
  console.error(run.stdout.slice(0, 2000));
  process.exit(2);
}

/** Counts keyed by "path :: rule", plus the critical findings listed in full. */
const counts = {};
const critical = [];
let total = 0;

for (const file of report) {
  const rel = path.relative(root, file.filePath).split(path.sep).join("/");
  for (const message of file.messages) {
    const rule = message.ruleId ?? null;
    if (CRITICAL.has(rule)) {
      critical.push(`${rel}:${message.line}  ${rule ?? "fatal"}  ${message.message}`);
      continue;
    }
    // Warnings are counted too: a rule downgraded to a warning is still a finding to drive down.
    const key = `${rel} :: ${rule ?? "fatal"}`;
    counts[key] = (counts[key] ?? 0) + 1;
    total += 1;
  }
}

if (update) {
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(baselinePath, `${JSON.stringify({ total, errors: sorted }, null, 2)}\n`);
  console.log(`lint-baseline: recorded ${total} finding(s) in ${Object.keys(sorted).length} file/rule pair(s).`);
  if (critical.length) {
    console.error(`\nlint-baseline: ${critical.length} CRITICAL finding(s) are never baselined:`);
    for (const line of critical) console.error(`  ${line}`);
    process.exit(1);
  }
  process.exit(0);
}

let failed = false;

if (critical.length) {
  console.error(`lint-baseline: ${critical.length} critical lint finding(s) — these are not allowed at any count:`);
  for (const line of critical) console.error(`  ${line}`);
  failed = true;
}

const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : { total: 0, errors: {} };
const recorded = baseline.errors ?? {};
const regressions = [];
for (const [key, count] of Object.entries(counts)) {
  const allowed = recorded[key] ?? 0;
  if (count > allowed) regressions.push(`${key}: ${count} (baseline ${allowed})`);
}

if (regressions.length) {
  console.error(`\nlint-baseline: ${regressions.length} new lint finding group(s) — not allowed:`);
  for (const line of regressions) console.error(`  ${line}`);
  console.error("\nFix them, or run `node scripts/lint-baseline.mjs --update` only when the total has gone DOWN.");
  failed = true;
}

if (failed) process.exit(1);

const improved = Object.entries(recorded).filter(([key, count]) => (counts[key] ?? 0) < count).length;
console.log(
  `lint-baseline: OK — ${total} finding(s), 0 critical, none new.` +
    (improved ? ` ${improved} group(s) improved; run with --update to lock in the lower ceiling.` : ""),
);
