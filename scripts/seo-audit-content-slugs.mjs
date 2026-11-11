#!/usr/bin/env node
/**
 * Read-only content URL migration audit. Does not query financial tables,
 * print donor data, write to MongoDB, or modify public routes.
 *
 * Run from the existing deployment directory so createRequire resolves its
 * installed @prisma/client:
 *   cd /root/minberiaksa
 *   node /tmp/minber-seo-migration-201/scripts/seo-audit-content-slugs.mjs
 *
 * Requires DATABASE_URL already available in the invoking environment.
 */
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(resolve(process.cwd(), "package.json"));
const { PrismaClient } = require("@prisma/client");
const LOCALES = ["ar","tr","en","fr","de","es","id","pt","ur","sq","it","nl","sv","no","da","ms","ja","zh","hi"];
const FAMILIES = [
  {
    kind: "projects", delegate: "campaign", prefix: "bagislar",
    select: { id:true, slug:true, title:true, description:true, isActive:true, isDeleted:true,
      translations:{select:{locale:true,slug:true,title:true,description:true,seoNoIndex:true}} },
    publicRow: row => row.isActive === true && row.isDeleted !== true,
    ready: (row, translation, locale) => locale === "ar"
      ? hasText(row.title) && hasText(row.description)
      : hasText(translation?.title) && hasText(translation?.description) && translation?.seoNoIndex !== "true",
  },
  {
    kind: "categories", delegate: "category", prefix: "category",
    select: { id:true, slug:true, name:true, description:true, isActive:true,
      translations:{select:{locale:true,slug:true,name:true,description:true,seoNoIndex:true}} },
    publicRow: row => row.isActive !== false,
    ready: (row, translation, locale) => locale === "ar"
      ? hasText(row.name)
      : hasText(translation?.name) && translation?.seoNoIndex !== "true",
  },
  {
    kind: "articles", delegate: "post", prefix: "blog",
    select: { id:true, slug:true, title:true, content:true, published:true,
      translations:{select:{locale:true,slug:true,title:true,content:true,seoNoIndex:true}} },
    publicRow: row => row.published === true,
    ready: (row, translation, locale) => locale === "ar"
      ? hasText(row.title) && hasText(row.content)
      : hasText(translation?.title) && hasText(translation?.content) && translation?.seoNoIndex !== "true",
  },
];

function hasText(value) { return typeof value === "string" && value.trim().length > 0; }
function keyFor(path) {
  try { return decodeURI(path).normalize("NFC").replace(/\/+$/, ""); }
  catch { return path.normalize("NFC").replace(/\/+$/, ""); }
}
function sample(value, limit = 20) { return value.slice(0, limit); }

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not available in this shell; aborting without writing.");
    process.exitCode = 2;
    return;
  }
  const prisma = new PrismaClient({ log: ["error"] });
  const outcome = {
    generatedAt: new Date().toISOString(),
    mode: "READ_ONLY",
    counts: {},
    localeCounts: {},
    warnings: [],
    collisions: [],
    unresolvedSamples: [],
    readinessDefinition: "Conservative field-presence heuristic, NOT editorial approval or proof of indexability",
  };
  const owner = new Map();
  try {
    for (const family of FAMILIES) {
      const rows = await prisma[family.delegate].findMany({ select: family.select });
      const stats = { total: rows.length, public: 0, hidden: 0, missingBaseSlug: 0,
        missingTranslations: 0, missingLocalizedSlugs: 0, presentButNotReady: 0, candidateReady: 0 };
      outcome.counts[family.kind] = stats;
      for (const locale of LOCALES) {
        outcome.localeCounts[locale] ||= {};
        outcome.localeCounts[locale][family.kind] = { public:0, candidateReady:0, missingTranslation:0,
          missingSlug:0, insufficientContent:0 };
      }
      for (const row of rows) {
        if (!family.publicRow(row)) { stats.hidden++; continue; }
        stats.public++;
        if (!hasText(row.slug)) stats.missingBaseSlug++;
        const translations = new Map((row.translations || []).map(t => [t.locale, t]));
        for (const locale of LOCALES) {
          const locStats = outcome.localeCounts[locale][family.kind];
          locStats.public++;
          const translation = locale === "ar" ? null : translations.get(locale);
          if (locale !== "ar" && !translation) {
            stats.missingTranslations++; locStats.missingTranslation++;
            continue;
          }
          const slug = locale === "ar" ? row.slug : translation?.slug;
          if (!hasText(slug)) {
            stats.missingLocalizedSlugs++; locStats.missingSlug++;
            continue;
          }
          if (!family.ready(row, translation, locale)) {
            stats.presentButNotReady++; locStats.insufficientContent++;
            continue;
          }
          stats.candidateReady++; locStats.candidateReady++;
          const path = keyFor("/" + locale + "/" + family.prefix + "/" + encodeURIComponent(slug));
          const existing = owner.get(path);
          if (existing && existing.id !== row.id) {
            outcome.collisions.push({ path, priorId: existing.id, currentId: row.id,
              priorKind: existing.kind, currentKind: family.kind });
          } else owner.set(path, { id:row.id, kind:family.kind });
        }
      }
    }
    // A source URL can be claimed by one entity only, across all its translations.
    outcome.collisions = sample(outcome.collisions, 100);
    if (outcome.collisions.length) outcome.warnings.push("URL_COLLISIONS_REQUIRE_MANUAL_REVIEW");
    if (outcome.counts.articles?.public > outcome.localeCounts.en.articles.candidateReady)
      outcome.warnings.push("ARTICLE_TRANSLATION_GAPS: do not advertise fallback body as an indexed translation");
    console.log(JSON.stringify(outcome, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  // Never print connection URLs or provider credentials.
  console.error("SEO_AUDIT_FAILED:", err?.code || err?.name || "unknown_error");
  process.exitCode = 1;
});
