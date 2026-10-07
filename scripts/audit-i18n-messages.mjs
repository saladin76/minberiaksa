#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const messagesDir = path.join(root, "i18n", "messages");
const strict = process.argv.includes("--strict");
const referenceLocale = "en";

const preferredOrder = [
  "ar","tr","en","fr","de","es","id","pt","ur","sq","it","nl","sv","no","da","ms","ja","zh","hi",
];

const locales = fs.readdirSync(messagesDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => name.replace(/\.json$/, ""))
  .sort((a, b) => {
    const ai = preferredOrder.indexOf(a);
    const bi = preferredOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

if (!locales.includes(referenceLocale)) {
  throw new Error(`Reference locale ${referenceLocale}.json is missing`);
}

function flatten(value, prefix = "", out = {}) {
  if (typeof value === "string") {
    out[prefix] = value;
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, `${prefix}[${index}]`, out));
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

function tokens(value) {
  return (String(value).match(/\{\{[^{}]+\}\}|\{[A-Za-z0-9_.-]+\}|https?:\/\/[^\s<>"')]+/g) ?? []).sort();
}

function protectedKeyOptional(locale, key) {
  // Arabic stores the Qur'anic source in .ar; translation-only .t keys are
  // intentionally absent so we never machine-translate the Qur'an back into Arabic.
  return locale === "ar" && /^quran\.[^.]+\.t$/.test(key);
}

function likelyEnglishLeak(locale, value) {
  if (locale === "en") return false;
  const text = String(value).trim();
  if (text.length < 18) return false;
  // Strong English-function-word signal only. Proper nouns, URLs and product
  // names should not make a locale fail merely because they use Latin script.
  return /\b(the|and|your|you|donation|donate|project|please|support|payment|account|continue|failed|successful|amount|email|phone)\b/i.test(text);
}

const raw = Object.fromEntries(
  locales.map((locale) => [
    locale,
    JSON.parse(fs.readFileSync(path.join(messagesDir, `${locale}.json`), "utf8")),
  ]),
);
const flat = Object.fromEntries(locales.map((locale) => [locale, flatten(raw[locale])]));
const reference = flat[referenceLocale];
const referenceKeys = Object.keys(reference).sort();

const rows = [];
const details = {};
let blocking = 0;

for (const locale of locales) {
  const current = flat[locale];
  const missing = referenceKeys.filter((key) => !(key in current) && !protectedKeyOptional(locale, key));
  const empty = referenceKeys.filter((key) => key in current && !String(current[key] ?? "").trim());
  const tokenMismatch = referenceKeys.filter((key) => {
    if (!(key in current)) return false;
    return JSON.stringify(tokens(reference[key])) !== JSON.stringify(tokens(current[key]));
  });
  const identicalToEnglish = locale === "en"
    ? []
    : referenceKeys.filter((key) => key in current && String(current[key]).trim() === String(reference[key]).trim() && String(reference[key]).trim().length > 3);
  const englishLeakCandidates = referenceKeys.filter((key) => key in current && likelyEnglishLeak(locale, current[key]));
  const extras = Object.keys(current).filter((key) => !(key in reference));

  const localeBlocking = missing.length + empty.length + tokenMismatch.length;
  blocking += localeBlocking;

  rows.push({
    locale,
    totalStringKeys: Object.keys(current).length,
    referenceKeys: referenceKeys.length,
    missingKeys: missing.length,
    emptyStrings: empty.length,
    tokenMismatch: tokenMismatch.length,
    identicalToEnglish: identicalToEnglish.length,
    englishLeakCandidates: englishLeakCandidates.length,
    extraKeys: extras.length,
  });
  details[locale] = {
    missing,
    empty,
    tokenMismatch,
    identicalToEnglish,
    englishLeakCandidates,
    extras,
  };
}

console.log("i18n audit complete");
console.table(rows);

fs.mkdirSync(path.join(root, "tmp"), { recursive: true });
fs.writeFileSync(
  path.join(root, "tmp", "i18n-audit-report.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), referenceLocale, locales, rows, details }, null, 2),
);

if (strict && blocking > 0) {
  console.error(`i18n strict audit failed: ${blocking} blocking catalog issue(s) across ${locales.length} public locales.`);
  for (const row of rows.filter((r) => r.missingKeys || r.emptyStrings || r.tokenMismatch)) {
    console.error(
      `  ${row.locale}: missing=${row.missingKeys}, empty=${row.emptyStrings}, protected-token-mismatch=${row.tokenMismatch}`,
    );
  }
  process.exit(1);
}
