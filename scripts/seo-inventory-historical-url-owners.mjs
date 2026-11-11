#!/usr/bin/env node
/**
 * Dry-run legacy URL ownership inventory, with immutable content IDs.
 *
 * READ ONLY. Outputs JSON to stdout, including PUBLIC paths and content IDs,
 * never donor or financial data. Uses the existing Prisma installation from
 * the invocation cwd. Does not run a migration or issue redirects.
 *
 * IMPORTANT: "previousSlugs" lacks locale provenance; entries involving it
 * are AMBIGUOUS until verified against historical sitemap/ad destinations.
 */
import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(resolve(process.cwd(), "package.json"));
const { PrismaClient } = require("@prisma/client");

const LOCALES = ["ar","tr","en","fr","de","es","id","pt","ur","sq","it","nl","sv","no","da","ms","ja","zh","hi"];
const MODELS = [
  { family: "project", model: "campaign", prefix: "bagislar", fields: {isActive:true,isDeleted:true},
    live: r => r.isActive === true && r.isDeleted !== true },
  { family: "category", model: "category", prefix: "category", fields: {isActive:true},
    live: r => r.isActive !== false },
  { family: "article", model: "post", prefix: "blog", fields: {published:true},
    live: r => r.published === true },
  { family: "super-category", model: "superCategory", prefix: "bagislar", fields: {isActive:true},
    live: r => r.isActive === true },
];
function goodSlug(value) {
  return typeof value === "string" && !!value.trim() &&
    !/[\/\\?#%\u0000-\u001f\u007f]/.test(value) &&
    value !== "." && value !== "..";
}
function normalizedPath(value) {
  return decodeURI(value).normalize("NFC").replace(/\/+$/, "");
}
const items = [];
const owners = new Map();
const issues = [];
const stats = {};
function register({ family, id, locale, prefix, slug, classification, isPublic }) {
  if (!goodSlug(slug)) {
    issues.push({type:"INVALID_SLUG",family,id,locale,classification});
    return;
  }
  const path = normalizedPath("/" + locale + "/" + prefix + "/" + encodeURIComponent(slug));
  const entity = family + ":" + id;
  const existing = owners.get(path);
  if (existing && existing !== entity) {
    issues.push({type:"MULTI_OWNER_PATH",path,owner:existing,other:entity});
  } else owners.set(path,entity);
  items.push({path,family,entityId:id,locale,classification,isPublic});
}
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_UNAVAILABLE");
  const prisma = new PrismaClient({log:["error"]});
  try {
    for (const model of MODELS) {
      const records = await prisma[model.model].findMany({select:{
        id:true,slug:true,previousSlugs:true,translations:{select:{locale:true,slug:true}},
        ...model.fields,
      }});
      stats[model.family]={all:records.length,public:0,observedPaths:0};
      for (const row of records) {
        const live = model.live(row);
        if (live) stats[model.family].public++;
        const start=items.length;
        for (const locale of LOCALES) {
          if (goodSlug(row.slug)) {
            register({family:model.family,id:row.id,locale,prefix:model.prefix,slug:row.slug,
              classification:locale==="ar"?"base-arabic":"base-cross-locale-legacy",isPublic:live});
          }
          for (const t of row.translations ?? []) {
            if (t.locale === locale && goodSlug(t.slug)) {
              register({family:model.family,id:row.id,locale,prefix:model.prefix,slug:t.slug,
                classification:"current-translated",isPublic:live});
            }
          }
          for (const slug of row.previousSlugs ?? []) {
            if (goodSlug(slug)) register({family:model.family,id:row.id,locale,
              prefix:model.prefix,slug,classification:"previous-unverified-locale",isPublic:live});
          }
        }
        stats[model.family].observedPaths += items.length-start;
      }
    }
    const unique = new Map();
    for (const item of items) {
      const key=item.path+"|"+item.family+"|"+item.entityId+"|"+item.locale;
      const prior=unique.get(key);
      if (!prior) unique.set(key,item);
      else if (prior.classification.startsWith("previous-") &&
               !item.classification.startsWith("previous-")) unique.set(key,item);
    }
    const audit={
      generatedAt:new Date().toISOString(),
      mode:"READ_ONLY_DRY_RUN",
      warning:"Inferred paths are NOT an approved redirect manifest. Historical locale use, ad destinations, translations, and final canonical targets must be verified.",
      stats,
      uniquePaths: new Set([...unique.values()].map(x=>x.path)).size,
      issueCount:issues.length,
      issues:issues.slice(0,300),
      records:[...unique.values()].sort((a,b)=>a.path.localeCompare(b.path)),
    };
    console.log(JSON.stringify(audit,null,2));
  } finally { await prisma.$disconnect(); }
}
main().catch(err=>{
  console.error("URL_INVENTORY_FAILED:", err?.code || (err?.message === "DATABASE_URL_UNAVAILABLE" ? "DATABASE_URL_UNAVAILABLE" : err?.name || "UNKNOWN_ERROR"));
  process.exitCode=1;
});
