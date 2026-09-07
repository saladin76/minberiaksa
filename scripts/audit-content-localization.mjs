#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TARGET_LOCALES = ["en", "fr", "tr", "id", "pt", "es", "de"];
const CRITICAL_LOCALE = "de";
const strict = process.argv.includes("--strict");
const repoRoot = process.cwd();
const outDir = path.join(repoRoot, "tmp");

function extract(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extract).filter(Boolean).join(" ");
  if (typeof node !== "object") return "";
  const own = typeof node.text === "string" ? node.text : "";
  const child = Array.isArray(node.content) ? extract(node.content) : "";
  return [own, child].filter(Boolean).join(" ");
}

function text(value) {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      return extract(parsed).replace(/\s+/g, " ").trim();
    } catch {}
  }
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function empty(value) {
  return text(value).length === 0;
}

function same(a, b) {
  const aa = text(a);
  const bb = text(b);
  return Boolean(aa && bb && aa === bb);
}

function arabicQuality(fields) {
  const issues = [];
  const englishLeak = /\b(Project|Campaign|Donate|Donation|Payment|Receipt|Share|Shares|Blog|News|Category)\b/i;
  for (const [field, value] of Object.entries(fields)) {
    const body = text(value);
    if (body && englishLeak.test(body)) {
      issues.push({ field, rule: "english_leak", suggestion: "English words appear inside the Arabic source content." });
    }
  }
  return issues;
}

function mapTranslations(rows) {
  return new Map((rows || []).filter((row) => row?.locale).map((row) => [row.locale, row]));
}

function evaluate({ section, id, label, arabicFields, translations, fields }) {
  const map = mapTranslations(translations);
  const localeStatus = {};
  const missingWork = [];
  for (const locale of TARGET_LOCALES) {
    const row = map.get(locale);
    const missingFields = [];
    const emptyFields = [];
    const identicalToArabicFields = [];
    for (const field of fields) {
      if (!row || !(field in row)) missingFields.push(field);
      else {
        if (empty(row[field])) emptyFields.push(field);
        if (same(arabicFields[field], row[field])) identicalToArabicFields.push(field);
      }
    }
    const complete = missingFields.length === 0 && emptyFields.length === 0 && identicalToArabicFields.length === 0;
    localeStatus[locale] = { exists: Boolean(row), complete, missingFields, emptyFields, identicalToArabicFields };
    if (!complete) {
      missingWork.push({
        locale,
        missingFields,
        emptyFields,
        identicalToArabicFields,
        sourceArabic: Object.fromEntries(fields.map((f) => [f, arabicFields[f] ?? null])),
      });
    }
  }
  return { section, id, label, arabicQualityIssues: arabicQuality(arabicFields), localeStatus, missingWork };
}

function summarize(items) {
  const byLocale = Object.fromEntries(TARGET_LOCALES.map((locale) => [locale, { incompleteItems: 0, missingRecords: 0, emptyFields: 0, identicalToArabicFields: 0 }]));
  const bySection = {};
  let arabicQualityIssues = 0;
  for (const item of items) {
    arabicQualityIssues += item.arabicQualityIssues.length;
    bySection[item.section] ||= { total: 0, arabicQualityIssues: 0 };
    bySection[item.section].total += 1;
    bySection[item.section].arabicQualityIssues += item.arabicQualityIssues.length;
    for (const locale of TARGET_LOCALES) {
      const status = item.localeStatus[locale];
      if (!status.complete) byLocale[locale].incompleteItems += 1;
      if (!status.exists) byLocale[locale].missingRecords += 1;
      byLocale[locale].emptyFields += status.emptyFields.length;
      byLocale[locale].identicalToArabicFields += status.identicalToArabicFields.length;
    }
  }
  return { totalItems: items.length, arabicQualityIssues, bySection, byLocale };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const [categories, campaigns, posts, postCategories] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }], include: { translations: true } }),
    prisma.campaign.findMany({ orderBy: { createdAt: "desc" }, include: { translations: true } }),
    prisma.post.findMany({ orderBy: { createdAt: "desc" }, include: { translations: true } }),
    prisma.postCategory.findMany({ orderBy: { createdAt: "desc" }, include: { translations: true } }),
  ]);

  const items = [];
  for (const x of categories) items.push(evaluate({ section: "categories", id: x.id, label: x.name, arabicFields: { name: x.name, description: x.description }, translations: x.translations, fields: ["name", "description"] }));
  for (const x of campaigns) items.push(evaluate({ section: "campaigns", id: x.id, label: x.title, arabicFields: { title: x.title, description: x.description }, translations: x.translations, fields: ["title", "description"] }));
  for (const x of posts) items.push(evaluate({ section: "blog_posts", id: x.id, label: x.title || "Untitled", arabicFields: { title: x.title, description: x.description, content: x.content }, translations: x.translations, fields: ["title", "description", "content"] }));
  for (const x of postCategories) items.push(evaluate({ section: "blog_categories", id: x.id, label: x.name, arabicFields: { name: x.name, title: x.title, description: x.description }, translations: x.translations, fields: ["name", "title", "description"] }));

  const report = {
    generatedAt: new Date().toISOString(),
    targetLocales: TARGET_LOCALES,
    criticalLocale: CRITICAL_LOCALE,
    dataSources: { categories: categories.length, campaigns: campaigns.length, blogPosts: posts.length, blogCategories: postCategories.length },
    summary: summarize(items),
    items,
  };
  const workload = {
    generatedAt: report.generatedAt,
    targetLocales: TARGET_LOCALES,
    instruction: "Translate from polished Arabic source into natural publication-quality target language. Preserve meaning, donation intent, formatting, URLs, and variables in braces.",
    rows: items.flatMap((item) => item.missingWork.map((work) => ({ section: item.section, id: item.id, label: item.label, ...work }))),
  };

  fs.writeFileSync(path.join(outDir, "content-localization-audit.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outDir, "content-localization-workload.json"), JSON.stringify(workload, null, 2));
  console.log("Content localization audit complete");
  console.log(JSON.stringify(report.summary, null, 2));
  if (strict && (report.summary.arabicQualityIssues > 0 || (report.summary.byLocale.de?.incompleteItems ?? 0) > 0)) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(async () => prisma.$disconnect());
