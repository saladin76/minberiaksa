#!/usr/bin/env node
/**
 * Locale drift guard.
 *
 * `lib/locales.ts` is the single source of truth for locales. A handful of files
 * cannot import it (edge/`.mjs`/static-import constraints) or carry per-locale
 * CONTENT keyed by locale. This script fails when any of those sources is missing
 * an enabled locale — the exact "de was silently dropped from one array" bug class
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

// Files that must contain (mention) every enabled locale code as a quoted token.
const COVERAGE_FILES = [
  "app/[locale]/layout.tsx", // static rawLocaleMessages import map
  "lib/marketing/locales-countries.ts", // marketing locale list (reordered)
  "app/layout.tsx", // JSON-LD knowsLanguage / inLanguage
  "scripts/audit-i18n-messages.mjs", // .mjs audit list
];

const problems = [];

// 1) A message file must exist for every enabled locale.
for (const code of enabled) {
  if (!existsSync(join(root, `i18n/messages/${code}.json`))) {
    problems.push(`missing message file: i18n/messages/${code}.json`);
  }
}

// 2) Coverage files must mention every enabled locale.
for (const rel of COVERAGE_FILES) {
  const src = read(rel);
  if (src == null) {
    problems.push(`coverage file not found (update this script): ${rel}`);
    continue;
  }
  const missing = enabled.filter((code) => !new RegExp(`["']${code}["']`).test(src));
  if (missing.length) {
    problems.push(`${rel} is missing enabled locale(s): ${missing.join(", ")}`);
  }
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
