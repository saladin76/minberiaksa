#!/usr/bin/env node
/**
 * Dashboard interface translations (Arabic → English, Turkish).
 *
 *   node scripts/dashboard-i18n.mjs extract   list phrases missing from a catalogue
 *                                              → lib/dashboard/i18n/catalog/missing.json
 *   node scripts/dashboard-i18n.mjs build     compile catalog/{en,tr}.json into generated/
 *   node scripts/dashboard-i18n.mjs check     extract + fail when anything is missing
 *
 * The Arabic in the source is the key (see lib/dashboard/i18n/index.ts). Phrases
 * come from:
 *  - `dt("…")`, `dtx("…", […])` and `dtList([…])` anywhere in the codebase;
 *  - other Arabic interface text in those same files (values compared before
 *    being shown, chart series names…), translated on screen by
 *    DashboardTextTranslator when they match exactly;
 *  - modules listed in `catalog/runtime-sources.json`, whose labels reach the
 *    dashboard through the API or from code the public site shares;
 *  - error and message strings returned by `app/api`.
 *
 * To translate a new phrase: run `extract`, add the entries from missing.json to
 * catalog/en.json and catalog/tr.json (keyed by the Arabic), then run `build`.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const ROOT = process.cwd();
const I18N_DIR = path.join(ROOT, "lib/dashboard/i18n");
const CATALOG_DIR = path.join(I18N_DIR, "catalog");
const GENERATED_DIR = path.join(I18N_DIR, "generated");
const LOCALES = ["en", "tr"];
const AR = /[؀-ۿ]/;
const WRAPPERS = new Set(["dt", "dtx", "dtList", "dtMaybe"]);
/* Content, search terms and data, not interface text. */
const SKIP_PROPS = new Set(["keywords", "aliases", "synonyms", "searchTerms", "body", "template", "html", "subject", "bodyAr", "textAr"]);
/* Interpolated messages are collected only from the dashboard's own routes, and
   never from routes that write content for the public site. */
const API_PATTERN_ROUTES = /^app\/api\/(admin|dashboard|bank-accounts|upload|campaigns|communication|categories|users|donations|super-categories|videos|urgent-banners|stories|slides|playlists|faqs|courses|global-settings|referrals|telegram|home-layout|reports|quick-donation|live-donation-ticker|booklets)\//;
const API_CONTENT_ROUTES = /\/(seo|translate|translations|auto-translate|content-generation|ai\/(?!concierge\/(conversations|insights|settings)))/;
const API_MESSAGE_PROPS =new Set(["error", "message", "msg", "reason", "details", "detail", "hint"]);

/** FNV-1a, base 36  must match `dashKeyHash` in lib/dashboard/i18n/index.ts. */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?|mjs)$/.test(entry.name)) out.push(p);
  }
  return out;
}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

/* Babel's JSX text whitespace rule, so keys match what React renders. */
function cleanJsxText(raw) {
  const lines = raw.split(/\r\n|\n|\r/);
  let lastNonEmpty = 0;
  lines.forEach((l, i) => { if (/[^ \t]/.test(l)) lastNonEmpty = i; });
  let str = "";
  lines.forEach((line, i) => {
    let t = line.replace(/\t/g, " ");
    if (i !== 0) t = t.replace(/^[ ]+/, "");
    if (i !== lines.length - 1) t = t.replace(/[ ]+$/, "");
    if (t) str += i !== lastNonEmpty ? `${t} ` : t;
  });
  return str;
}

function parse(file) {
  const text = fs.readFileSync(file, "utf8");
  const kind = /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
}

function propName(p) {
  const n = p?.name;
  return n && (ts.isIdentifier(n) || ts.isStringLiteral(n)) ? n.text : null;
}

function insideSkipped(node) {
  for (let p = node.parent; p; p = p.parent) {
    /* Already collected as a dt() phrase. */
    if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && WRAPPERS.has(p.expression.text)) return true;
    if (ts.isCallExpression(p) && /^console\./.test(p.expression.getText())) return true;
    if (ts.isPropertyAssignment(p) && SKIP_PROPS.has(propName(p))) return true;
    if (ts.isJsxAttribute(p) && p.name.getText() === "value") return true;
    if (ts.isImportDeclaration(p) || ts.isLiteralTypeNode(p)) return true;
    if (ts.isFunctionLike(p)) return false;
  }
  return false;
}

/** Collect phrases: Map<arabic, Set<source>>. */
function collect() {
  const phrases = new Map();
  const add = (text, source) => {
    const key = text.trim();
    /* A lone Arabic letter is noise; Arabic punctuation ("، " as a list separator) is not. */
    if (!key || !AR.test(key) || (key.length < 2 && !/[،؛؟]/.test(key))) return;
    if (!phrases.has(key)) phrases.set(key, new Set());
    phrases.get(key).add(source);
  };

  const sourceFiles = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "lib")), ...walk(path.join(ROOT, "components")), ...walk(path.join(ROOT, "hooks")), ...walk(path.join(ROOT, "context"))];
  const runtimeSources = new Set(JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, "runtime-sources.json"), "utf8")).files);

  for (const file of sourceFiles) {
    const text = fs.readFileSync(file, "utf8");
    if (!AR.test(text)) continue;
    const r = rel(file);
    const usesDt = /from ["']@\/lib\/dashboard\/i18n["']/.test(text);
    const isRuntime = runtimeSources.has(r);
    const isApi = r.startsWith("app/api/");
    if (!usesDt && !isRuntime && !isApi) continue;
    const sf = parse(file);

    (function visit(n) {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && WRAPPERS.has(n.expression.text) && n.arguments.length) {
        const a = n.arguments[0];
        if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) add(a.text, r);
        else if (ts.isArrayLiteralExpression(a) || (ts.isAsExpression(a) && ts.isArrayLiteralExpression(a.expression))) {
          const arr = ts.isAsExpression(a) ? a.expression : a;
          for (const e of arr.elements) {
            if (ts.isStringLiteral(e)) add(e.text, r);
            else if (ts.isCallExpression(e) && e.expression.getText() === "dtList") visit(e);
          }
        }
      } else if ((usesDt || isRuntime) && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && AR.test(n.text) && !insideSkipped(n)) {
        add(n.text, `${r} (runtime)`);
      } else if ((isRuntime || (isApi && API_PATTERN_ROUTES.test(r) && !API_CONTENT_ROUTES.test(r))) && ts.isTemplateExpression(n) && !ts.isTaggedTemplateExpression(n.parent) && AR.test(n.getText()) && !insideSkipped(n)) {
        /* `${n} محادثة` → "{0} محادثة": matched on screen as a pattern. */
        let template = n.head.text;
        n.templateSpans.forEach((span, i) => { template += `{${i}}${span.literal.text}`; });
        if (template.replace(/\{\d+\}/g, "").trim()) add(template, `${r} (pattern)`);
      } else if ((usesDt || isRuntime) && ts.isJsxText(n) && AR.test(n.text)) {
        add(cleanJsxText(n.text), `${r} (runtime)`);
      } else if (isApi && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && AR.test(n.text)) {
        const p = n.parent;
        const isMessageProp = ts.isPropertyAssignment(p) && API_MESSAGE_PROPS.has(propName(p));
        const isErrorArg = ts.isNewExpression(p) && /Error$/.test(p.expression.getText());
        const inTernaryOfMessage = ts.isConditionalExpression(p) && ts.isPropertyAssignment(p.parent) && API_MESSAGE_PROPS.has(propName(p.parent));
        /* The dashboard's own routes answer only the dashboard: all their text is interface text. */
        const dashboardRoute = API_PATTERN_ROUTES.test(r) && !API_CONTENT_ROUTES.test(r) && !insideSkipped(n);
        if (isMessageProp || isErrorArg || inTernaryOfMessage || dashboardRoute) add(n.text, `${r} (api)`);
      }
      ts.forEachChild(n, visit);
    })(sf);
  }
  return phrases;
}

function readCatalog(locale) {
  const file = path.join(CATALOG_DIR, `${locale}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

function placeholders(s) {
  return (s.match(/\{\d+\}/g) || []).sort().join(",");
}

function extract() {
  const phrases = collect();
  const catalogs = Object.fromEntries(LOCALES.map((l) => [l, readCatalog(l)]));
  const missing = [];
  for (const [ar, sources] of phrases) {
    const lacks = LOCALES.filter((l) => typeof catalogs[l][ar] !== "string");
    if (lacks.length) missing.push({ ar, missing: lacks, sources: [...sources].slice(0, 3) });
  }
  fs.writeFileSync(path.join(CATALOG_DIR, "missing.json"), JSON.stringify(missing, null, 1) + "\n");
  const stale = Object.keys(catalogs.en).filter((k) => !phrases.has(k)).length;
  console.log(`dashboard-i18n: ${phrases.size} phrases, ${missing.length} missing a translation, ${stale} catalogue entries no longer used`);
  return { phrases, missing };
}

function build() {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  let problems = 0;
  /* Phrases with placeholders that reach the screen without dt(): kept with their
     Arabic so DashboardTextTranslator can match them as patterns. */
  const patternKeys = [...collect()]
    .filter(([ar, sources]) => /\{\d+\}/.test(ar) && [...sources].some((s) => /\((runtime|api|pattern)\)$/.test(s)))
    /* Too little fixed text ("حملة {0}") would also match a project's own title. */
    .filter(([ar]) => ar.replace(/\{\d+\}/g, "").trim().length >= 6)
    .map(([ar]) => ar);
  for (const locale of LOCALES) {
    const catalog = readCatalog(locale);
    const out = {};
    const seen = new Map();
    for (const [ar, translated] of Object.entries(catalog).sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (typeof translated !== "string" || !translated.trim()) continue;
      if (placeholders(ar) !== placeholders(translated)) {
        console.error(`dashboard-i18n: ${locale} placeholder mismatch for "${ar}" → "${translated}"`);
        problems++;
        continue;
      }
      const h = hash(ar.trim());
      if (seen.has(h) && seen.get(h) !== ar.trim()) {
        console.error(`dashboard-i18n: hash collision between "${seen.get(h)}" and "${ar}"`);
        problems++;
        continue;
      }
      seen.set(h, ar.trim());
      out[h] = translated.trim();
    }
    fs.writeFileSync(path.join(GENERATED_DIR, `${locale}.json`), JSON.stringify(out) + "\n");
    console.log(`dashboard-i18n: ${locale}  ${Object.keys(out).length} entries`);
  }
  const catalogs = Object.fromEntries(LOCALES.map((l) => [l, readCatalog(l)]));
  const patterns = patternKeys
    .filter((ar) => LOCALES.every((l) => typeof catalogs[l][ar] === "string" && placeholders(catalogs[l][ar]) === placeholders(ar)))
    .sort((a, b) => b.length - a.length)
    .map((ar) => [ar, ...LOCALES.map((l) => catalogs[l][ar].trim())]);
  fs.writeFileSync(path.join(GENERATED_DIR, "patterns.json"), JSON.stringify(patterns) + "\n");
  console.log(`dashboard-i18n: ${patterns.length} runtime patterns`);
  if (problems) process.exitCode = 1;
}

const command = process.argv[2];
if (command === "extract") extract();
else if (command === "build") build();
else if (command === "check") {
  const { missing } = extract();
  if (missing.length) process.exitCode = 1;
} else {
  console.error("usage: node scripts/dashboard-i18n.mjs <extract|build|check>");
  process.exitCode = 2;
}
