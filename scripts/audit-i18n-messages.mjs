#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const messagesDir = path.join(repoRoot, "i18n", "messages");
const locales = ["ar", "en", "fr", "tr", "id", "pt", "es", "de"];
const referenceLocale = "en";
const nonEnglishLocales = locales.filter((locale) => locale !== "en");

const englishLeakWords = [
  "Donate", "Donation", "Campaign", "Project", "Projects", "News", "About", "Contact",
  "Search", "Loading", "Read More", "View All", "Try again", "Email", "Phone", "Message",
  "Subscribe", "Newsletter", "Dashboard", "Profile", "Sign In", "Sign Out", "Cart", "Payment",
  "Bank Transfer", "Account", "Copied", "Copy", "Quick Donate", "Featured", "Current",
];

function readJson(locale) {
  const file = path.join(messagesDir, `${locale}.json`);
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw);
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function flatten(value, prefix = "", out = {}) {
  if (typeof value === "string") {
    out[prefix] = value;
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, `${prefix}[${index}]`, out));
  } else if (isObject(value)) {
    Object.entries(value).forEach(([key, item]) => flatten(item, prefix ? `${prefix}.${key}` : key, out));
  }
  return out;
}

function keysOfObject(value, prefix = "", out = new Set()) {
  if (isObject(value)) {
    Object.entries(value).forEach(([key, item]) => keysOfObject(item, prefix ? `${prefix}.${key}` : key, out));
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => keysOfObject(item, `${prefix}[${index}]`, out));
  } else {
    out.add(prefix);
  }
  return out;
}

function likelyEnglish(text) {
  if (!text || typeof text !== "string") return false;
  const normalized = text.trim();
  if (!normalized) return false;
  if (/^[A-Z0-9_{}.,:;!?'"()\-\s/&]+$/.test(normalized) && /[A-Z][a-z]/.test(normalized)) return true;
  const hits = englishLeakWords.filter((word) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(normalized));
  return hits.length >= 1 && !/[\u0600-\u06FF\u00C0-\u017F\u0100-\u024F]/.test(normalized.replace(/[A-Za-z]/g, ""));
}

function unresolvedMacro(text) {
  return typeof text === "string" && (text.includes("{{") || text.includes("}}") || text.includes("__CAMPAIGN_") || text.includes("__ADGROUP_") || text.includes("__AD_"));
}

const messages = Object.fromEntries(locales.map((locale) => [locale, readJson(locale)]));
const flat = Object.fromEntries(locales.map((locale) => [locale, flatten(messages[locale])]));
const keySets = Object.fromEntries(locales.map((locale) => [locale, keysOfObject(messages[locale])]));
const allKeys = new Set(Object.values(keySets).flatMap((set) => [...set]));

const report = {
  generatedAt: new Date().toISOString(),
  locales,
  referenceLocale,
  summary: {},
  missingKeys: {},
  emptyStrings: {},
  unresolvedMacros: {},
  englishLeakCandidates: {},
  identicalToEnglish: {},
};

for (const locale of locales) {
  const missing = [...allKeys].filter((key) => !keySets[locale].has(key)).sort();
  const empties = Object.entries(flat[locale]).filter(([, value]) => !value.trim()).map(([key]) => key).sort();
  const macros = Object.entries(flat[locale]).filter(([, value]) => unresolvedMacro(value)).map(([key, value]) => ({ key, value })).sort((a, b) => a.key.localeCompare(b.key));
  const identical = locale === "en" ? [] : Object.entries(flat[locale])
    .filter(([key, value]) => typeof flat[referenceLocale][key] === "string" && value.trim() && value.trim() === flat[referenceLocale][key].trim())
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const leaks = nonEnglishLocales.includes(locale) ? Object.entries(flat[locale])
    .filter(([, value]) => likelyEnglish(value))
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => a.key.localeCompare(b.key)) : [];

  report.summary[locale] = {
    totalStringKeys: Object.keys(flat[locale]).length,
    totalLeafKeys: keySets[locale].size,
    missingKeys: missing.length,
    emptyStrings: empties.length,
    unresolvedMacros: macros.length,
    identicalToEnglish: identical.length,
    englishLeakCandidates: leaks.length,
  };
  report.missingKeys[locale] = missing;
  report.emptyStrings[locale] = empties;
  report.unresolvedMacros[locale] = macros;
  report.identicalToEnglish[locale] = identical.slice(0, 200);
  report.englishLeakCandidates[locale] = leaks.slice(0, 300);
}

const outDir = path.join(repoRoot, "tmp");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "i18n-audit-report.json");
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

console.log("i18n audit complete");
console.table(report.summary);
console.log(`Full report written to ${path.relative(repoRoot, outFile)}`);

const hasBlockingIssues = locales.some((locale) => report.summary[locale].missingKeys > 0 || report.summary[locale].emptyStrings > 0);
if (process.argv.includes("--strict") && hasBlockingIssues) process.exit(1);
