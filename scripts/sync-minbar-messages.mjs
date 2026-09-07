#!/usr/bin/env node
/**
 * Merge the Minbar Al-Aqsa design handoff's i18n bundles into the app's
 * next-intl message files.
 *
 * Source : Minbar/i18n/<lang>/<namespace>.json   (19 languages × 23 namespaces,
 *          generated from the Arabic masters by Minbar/translation-sync.js —
 *          never hand-edited, per Minbar/CLAUDE.md)
 * Target : i18n/messages/<lang>.json
 *
 * The two key spaces do not collide: the app's own namespaces are PascalCase
 * (`Navbar`, `HomePage`, …) and Minbar's are lowercase (`navigation`,
 * `homepage`, …), so this merges in place and leaves existing copy untouched.
 *
 * Locales the app has no message file for yet are created containing only the
 * Minbar namespaces. `buildNormalizedMessages()` in `i18n/message-quality.ts`
 * deep-fills whatever is missing from `en`, which is exactly the fallback chain
 * the handoff specifies (`code → en → ar`), so the app namespaces do not need to
 * be duplicated into all 19 files.
 *
 * Re-run after any change to the Arabic masters:  node scripts/sync-minbar-messages.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRC = "Minbar/i18n";
const OUT = "i18n/messages";

if (!existsSync(SRC)) {
  console.error(`[minbar-i18n] source not found: ${SRC} — nothing to sync.`);
  process.exit(1);
}

const namespaces = readdirSync(SRC)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();

const locales = readdirSync(SRC)
  .filter((d) => statSync(join(SRC, d)).isDirectory())
  .sort();

/**
 * The handoff bundles are flat maps, and 232 of their keys carry a dot
 * (`hero.title`, `cta.waqf.eyebrow`). next-intl reads `.` as the nesting
 * separator and rejects a flat key containing one outright — "INVALID_KEY:
 * Namespace keys can not contain the character '.'". Expanding them into real
 * objects keeps the call sites identical (`t("hero.title")` still resolves)
 * without rewriting the source bundles, which are generated and must not be
 * hand-edited.
 *
 * No bundle has a key that is also a prefix of another (checked across all 19
 * languages), so nothing is lost to a collision; if one is ever introduced this
 * throws rather than silently dropping the shorter key.
 */
function nestDottedKeys(flat, context) {
  const out = {};
  for (const [key, value] of Object.entries(flat)) {
    if (!key.includes(".")) {
      if (out[key] !== undefined && typeof out[key] === "object") {
        throw new Error(`[minbar-i18n] ${context}: "${key}" is both a value and a prefix of nested keys`);
      }
      out[key] = value;
      continue;
    }
    const parts = key.split(".");
    let node = out;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i];
      if (node[part] === undefined) node[part] = {};
      else if (typeof node[part] !== "object") {
        throw new Error(`[minbar-i18n] ${context}: "${key}" collides with the scalar key "${parts.slice(0, i + 1).join(".")}"`);
      }
      node = node[part];
    }
    node[parts[parts.length - 1]] = value;
  }
  return out;
}

let written = 0;
let keys = 0;

for (const locale of locales) {
  const target = join(OUT, `${locale}.json`);
  const existing = existsSync(target) ? JSON.parse(readFileSync(target, "utf8")) : {};

  for (const ns of namespaces) {
    const file = join(SRC, locale, `${ns}.json`);
    if (!existsSync(file)) {
      console.warn(`[minbar-i18n] missing bundle ${locale}/${ns}.json — skipped`);
      continue;
    }
    const bundle = JSON.parse(readFileSync(file, "utf8"));
    // `_sync` is bookkeeping for translation-sync.js (sourceHash/status) and is
    // never user-facing copy — it must not reach the client bundle.
    delete bundle._sync;
    keys += Object.keys(bundle).length;
    existing[ns] = nestDottedKeys(bundle, `${locale}/${ns}`);
  }

  writeFileSync(target, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
  written += 1;
}

console.log(
  `[minbar-i18n] ${written} locale files written · ${namespaces.length} namespaces · ${keys} keys`
);
