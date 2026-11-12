#!/usr/bin/env node
/**
 * Freeze a REVIEW-ONLY manifest from a real sitemap snapshot and a candidate
 * entity-ownership inventory. Never grants redirect approval.
 *
 * Usage:
 * node scripts/seo-build-review-manifest.mjs \
 *   /tmp/minber-public-urls-20261111.json \
 *   /tmp/minber-seo-historical-urls.json \
 *   > /tmp/minber-seo-review-manifest.json
 *
 * No database/network access. A route must be manually approved before a
 * future application can consume it as a redirect. Do not deploy this file.
 */
import { readFileSync } from "node:fs";
import { SLUGS, NOINDEX_ROUTES } from "../lib/minbar/routes.ts";

const [sitemapFile, ownershipFile] = process.argv.slice(2);
if (!sitemapFile || !ownershipFile) {
  console.error("Expected sitemap and historical ownership JSON paths");
  process.exit(2);
}
const localeSet = new Set(["ar","tr","en","fr","de","es","id","pt","ur","sq","it","nl","sv","no","da","ms","ja","zh","hi"]);
const STATIC_EXCLUDED = new Set(["projectDetail","reportDetail","article","restorationProject","ibadanProject"]);
const STATIC_ROUTES = new Map();
for (const [route, slug] of Object.entries(SLUGS)) {
  if (STATIC_EXCLUDED.has(route) || NOINDEX_ROUTES.has(route)) continue;
  if (STATIC_ROUTES.has(slug)) throw new Error("DUPLICATE_STATIC_SLUG");
  STATIC_ROUTES.set(slug,route);
}
STATIC_ROUTES.set("campaigns","legacy-campaigns");
STATIC_ROUTES.set("bank-transfer","bank-transfer");

function publicPath(value) {
  const text = typeof value === "string" ? value : value?.loc || value?.url;
  if (typeof text !== "string") throw new Error("INVALID_URL_ROW");
  const url = new URL(text,"https://minberiaksa.org");
  if (url.protocol !== "https:" ||
      !["minberiaksa.org","www.minberiaksa.org"].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash) throw new Error("UNSAFE_SOURCE_URL");
  const loc = url.pathname.split("/")[1];
  if (!localeSet.has(loc)) throw new Error("UNKNOWN_LOCALE");
  let normalized;
  try { normalized = decodeURI(url.pathname).normalize("NFC"); }
  catch { throw new Error("INVALID_URL_ENCODING"); }
  if (/%(?:2f|5c|00|2e)/i.test(normalized) ||
      /%(?:2f|5c|00)/i.test(url.pathname) ||
      normalized.includes("//") ||
      normalized.split("/").some(segment=>segment==="."||segment==="..")) {
    throw new Error("UNSAFE_SOURCE_PATH");
  }
  return normalized.replace(/\/+$/,"") || "/";
}
const sitemap = JSON.parse(readFileSync(sitemapFile,"utf8"));
const ownership = JSON.parse(readFileSync(ownershipFile,"utf8"));
const urls = Array.isArray(sitemap) ? sitemap : sitemap.urls;
if (!Array.isArray(urls) || !Array.isArray(ownership.records)) throw new Error("INVALID_INPUT_SCHEMA");
const owners = new Map();
for (const row of ownership.records) {
  const p = publicPath(row.path);
  const list = owners.get(p) || [];
  list.push(row);
  owners.set(p,list);
}
const output = {
  version: 1,
  status: "REVIEW_ONLY_NOT_FOR_REDIRECTS",
  sourceSnapshot: sitemapFile,
  generatedAt: new Date().toISOString(),
  counts: {},
  rows: [],
  warnings: [
    "Every row requires eligibility review; NONE are approved redirects.",
    "Cross-locale fallback slugs are not proof of translated content.",
    "These records do not include ad-account destinations or archived sitemap URLs.",
    "Static page classification is source-code shape only; not a live HTTP/SEO test.",
  ],
};
const seen = new Set();
for (const input of urls) {
  const path = publicPath(input);
  if (seen.has(path)) throw new Error("DUPLICATE_SITEMAP_ENTRY");
  seen.add(path);
  const locale=path.split("/")[1];
  const candidates=owners.get(path) || [];
  const ownerIDs=[...new Set(candidates.map(r=>r.family+":"+r.entityId))];
  let status, family=null, entityId=null, evidence=[], routeKey=null;
  if (ownerIDs.length > 1) status="AMBIGUOUS_ENTITY_OWNERSHIP";
  else if (ownerIDs.length === 1) {
    family=candidates[0].family;
    entityId=candidates[0].entityId;
    evidence=[...new Set(candidates.map(r=>r.classification))].sort();
    status = candidates.some(r=>r.isPublic===true)
      ? evidence.includes("current-translated") || locale==="ar"
        ? "ENTITY_REVIEW_TRANSLATION_AND_TARGET"
        : "ENTITY_REVIEW_FALLBACK_SLUG"
      : "ENTITY_NOT_CURRENTLY_PUBLIC";
  } else {
    const tail=path.split("/").slice(2).join("/");
    if (STATIC_ROUTES.has(tail)) {
      status="STATIC_REVIEW_TRANSLATED_ROUTE";
      routeKey=STATIC_ROUTES.get(tail);
    } else status="UNRECOGNIZED_SOURCE_URL";
  }
  output.counts[status]=(output.counts[status]||0)+1;
  output.rows.push({
    sourcePath:path,locale,status,family,entityId,routeKey,evidence,
    proposedTarget:null,approved:false,redirectCode:null,
  });
}
output.counts.total=output.rows.length;
if (sitemap.count!==undefined && sitemap.count!==output.rows.length)
  throw new Error("SITEMAP_COUNT_MISMATCH");
console.log(JSON.stringify(output,null,2));
