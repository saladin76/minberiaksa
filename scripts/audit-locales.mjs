#!/usr/bin/env node
/**
 * Locale drift guard.
 *
 * `lib/locales.ts` is the single source of truth for locales. A handful of files
 * cannot import it (edge/`.mjs`/static-import constraints) or carry per-locale
 * CONTENT keyed by locale. This script fails when any of those sources is missing
 * an enabled locale  the exact "de was silently dropped from one array" bug class
 * the Phase 0 audit found.
 *
 * Usage:
 *   node scripts/audit-locales.mjs           # report, exit 0
 *   node scripts/audit-locales.mjs --strict  # exit 1 on any drift (CI)
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.argv.includes("--strict");

function read(rel) {
  const p = join(root, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

// --- Parse the enabled/public locale set from the catalog ---------------------
const catalog = read("lib/locales.ts");
if (!catalog) {
  console.error("✗ cannot read lib/locales.ts");
  process.exit(1);
}
const supMatch = catalog.match(/export const SUPPORTED_LOCALES\s*=\s*\[([\s\S]*?)\]\s*as const/);
if (!supMatch) {
  console.error("✗ could not parse SUPPORTED_LOCALES from lib/locales.ts");
  process.exit(1);
}
const enabled = [...supMatch[1].matchAll(/["']([a-z]{2})["']/g)].map((m) => m[1]);
if (enabled.length === 0) {
  console.error("✗ SUPPORTED_LOCALES parsed empty");
  process.exit(1);
}

// Files that must explicitly enumerate every locale because they cannot import
// the TypeScript catalog at runtime.
const EXPLICIT_COVERAGE_FILES = [
  "scripts/audit-i18n-messages.mjs",
];

// Files that SHOULD derive from the central locale source rather than repeat all
// 19 literals. Requiring literal codes here produced false failures precisely
// after the code was improved to use SUPPORTED_LOCALES/LOCALES.
const DERIVED_COVERAGE_FILES = [
  { rel: "app/[locale]/layout.tsx", signals: ["SUPPORTED_LOCALES"] },
  { rel: "app/layout.tsx", signals: ["LOCALES", "@/lib/seo"] },
];

// Marketing targeting is an intentionally narrower operational subset, not the
// public routing catalog. Guard that it never invents an unsupported locale,
// but do not force it to expose every public language.
const INTENTIONAL_SUBSET_FILES = [
  "lib/marketing/locales-countries.ts",
];

const problems = [];

// 1) A message file must exist for every enabled locale.
for (const code of enabled) {
  if (!existsSync(join(root, `i18n/messages/${code}.json`))) {
    problems.push(`missing message file: i18n/messages/${code}.json`);
  }
}

// 2) Sources that cannot import the catalog must still enumerate every locale.
for (const rel of EXPLICIT_COVERAGE_FILES) {
  const src = read(rel);
  if (src == null) {
    problems.push(`coverage file not found (update this script): ${rel}`);
    continue;
  }
  const missing = enabled.filter((code) => !new RegExp(`["']${code}["']`).test(src));
  if (missing.length) problems.push(`${rel} is missing enabled locale(s): ${missing.join(", ")}`);
}

// 3) Import-capable files must prove they use the central source instead of a
// duplicated hand-written locale list.
for (const { rel, signals } of DERIVED_COVERAGE_FILES) {
  const src = read(rel);
  if (src == null) {
    problems.push(`coverage file not found (update this script): ${rel}`);
    continue;
  }
  if (!signals.some((signal) => src.includes(signal))) {
    problems.push(`${rel} does not derive locale coverage from the central catalog`);
  }
}

// 4) Intentionally scoped locale subsets may be smaller, but every locale they
// expose must belong to the public catalog.
for (const rel of INTENTIONAL_SUBSET_FILES) {
  const src = read(rel);
  if (src == null) {
    problems.push(`coverage file not found (update this script): ${rel}`);
    continue;
  }
  const block = src.match(/SUPPORTED_MARKETING_LOCALES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!block) {
    problems.push(`${rel} has no parseable supported-locale subset`);
    continue;
  }
  const subset = [...block[1].matchAll(/["']([a-z]{2})["']/g)].map((m) => m[1]);
  const unsupported = subset.filter((code) => !enabled.includes(code));
  if (unsupported.length) problems.push(`${rel} contains unsupported locale(s): ${unsupported.join(", ")}`);
}

// --- Report -------------------------------------------------------------------
console.log(`Locale catalog (enabled): ${enabled.join(", ")}`);
if (problems.length === 0) {
  console.log("✓ no locale drift detected");
  process.exit(0);
}
console.log(`\n✗ ${problems.length} locale drift issue(s):`);
for (const p of problems) console.log(`  - ${p}`);
console.log(
  "\nFix: update the flagged file(s) to cover every enabled locale, or reconcile" +
    " them with lib/locales.ts. See docs/implementation-packages/locale-foundation.md."
);
process.exit(strict ? 1 : 0);
