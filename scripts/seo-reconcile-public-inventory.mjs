#!/usr/bin/env node
/**
 * Offline, read-only correlation of public sitemap URLs with inferred URL
 * ownership. Does not grant redirect approval or contact the production site.
 *
 * node scripts/seo-reconcile-public-inventory.mjs \
 *   /tmp/minber-public-urls-20261111.json \
 *   /tmp/minber-seo-historical-urls.json > /tmp/minber-seo-url-reconciliation.json
 */
import { readFileSync } from "node:fs";
import { SLUGS, NOINDEX_ROUTES } from "../lib/minbar/routes.ts";

// Classify the static pages in the live sitemap separately from CMS entities.
const EXCLUDED_STATIC = new Set(["projectDetail", "reportDetail", "article",
  "restorationProject", "ibadanProject"]);
const STATIC_SLUGS = new Map();
for (const [route, slug] of Object.entries(SLUGS)) {
  if (NOINDEX_ROUTES.has(route) || EXCLUDED_STATIC.has(route)) continue;
  if (STATIC_SLUGS.has(slug)) throw new Error("DUPLICATE_STATIC_ROUTE");
  STATIC_SLUGS.set(slug, route);
}
STATIC_SLUGS.set("campaigns", "legacy-campaigns");
STATIC_SLUGS.set("bank-transfer", "bank-transfer");


const [sitemapFile, ownershipFile] = process.argv.slice(2);
if (!sitemapFile || !ownershipFile) {
  console.error("Usage: node script.mjs <sitemap-json> <ownership-json>");
  process.exit(2);
}

function normalize(input) {
  const raw = typeof input === "string" ? input : input?.loc ?? input?.url ?? input?.href;
  if (typeof raw !== "string" || !raw) throw new Error("INVALID_SITEMAP_URL");
  // Accept only this project's public production URLs, not arbitrary redirects.
  const url = new URL(raw, "https://minberiaksa.org");
  if (!["minberiaksa.org", "www.minberiaksa.org"].includes(url.hostname) ||
      url.protocol !== "https:" || url.username || url.password) throw new Error("FOREIGN_SITEMAP_URL");
  const segments = url.pathname.split("/").filter(Boolean);
  if (!segments.length || !/^[a-z]{2}$/.test(segments[0])) throw new Error("UNSCOPED_SITEMAP_URL");
  const decoded = decodeURI(url.pathname).normalize("NFC");
  if (/%(?:2f|5c|00|2e)/i.test(decoded) || /%(?:2f|5c|00)/i.test(url.pathname) ||
      decoded.includes("//") || decoded.split("/").some(v => v === "." || v === "..")) {
    throw new Error("UNSAFE_SITEMAP_URL");
  }
  return decoded.replace(/\/+$/, "") || "/";
}
function safeRead(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}
function main() {
  const sitemap = safeRead(sitemapFile);
  const ownership = safeRead(ownershipFile);
  const urls = Array.isArray(sitemap) ? sitemap : sitemap.urls;
  if (!Array.isArray(urls) || !Array.isArray(ownership.records)) throw new Error("INVALID_AUDIT_SCHEMA");
  const matchedOwners = new Map();
  for (const row of ownership.records) {
    if (!row || typeof row.path !== "string" || typeof row.entityId !== "string") continue;
    const path = normalize(row.path);
    const rows = matchedOwners.get(path) || [];
    rows.push(row);
    matchedOwners.set(path, rows);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    type: "READ_ONLY_SITEMAP_CORRELATION",
    sourceCounts: { sitemapReported: sitemap.count ?? null, sitemapRows: urls.length,
      ownershipPaths: ownership.uniquePaths ?? null, ownershipRecords: ownership.records.length },
    totals: { distinctSitemapPaths: 0, inferredUniqueOwner: 0, unmatched: 0,
      ambiguousOwner: 0, priorSlugOnly: 0, matchedNotPublic: 0,
      inferredCurrentTranslation: 0, inferredBaseOrCrossLocale: 0, staticOrUnmodeled: 0, stillUnmatched: 0 },
    byLocale: {},
    unresolvedSamples: [],
    ambiguousSamples: [],
    historicalOnlySamples: [],
    staleSamples: [],
    staticRouteSamples: [],
    notes: [
      "Sitemap-only match is not proof of historical ad usage or a safe redirect destination.",
      "Previous slug guesses were generated across 19 locales; require independent evidence.",
      "This comparison does not check live HTTP status, canonical, translation quality, SEO indexability, or all old URLs.",
      "Static route shape matching is not proof of live HTTP 200 or an editorially localized page.",
    ],
  };
  const seen = new Set();
  for (const entry of urls) {
    const path = normalize(entry);
    if (seen.has(path)) continue;
    seen.add(path);
    const locale = path.split("/")[1];
    const per = output.byLocale[locale] ||= {total:0,inferredUniqueOwner:0,unmatched:0,
      ambiguousOwner:0,priorSlugOnly:0,matchedNotPublic:0};
    per.total++;
    const rows = matchedOwners.get(path) || [];
    if (!rows.length) {
      const parts = path.split("/").filter(Boolean);
      const staticSlug = parts.slice(1).join("/");
      const staticKey = STATIC_SLUGS.get(staticSlug);
      if (staticKey !== undefined) {
        output.totals.staticOrUnmodeled++;
        per.staticRouteShape = (per.staticRouteShape || 0) + 1;
        if (output.staticRouteSamples.length < 30) {
          output.staticRouteSamples.push({ path, route: staticKey });
        }
        continue;
      }
      output.totals.stillUnmatched++;
      output.totals.unmatched++;
      per.unmatched++;
      if (output.unresolvedSamples.length < 30) output.unresolvedSamples.push(path);
      continue;
    }
    const uniqueOwners = new Map(rows.map(row => [row.family + ":" + row.entityId, row]));
    if (uniqueOwners.size > 1) {
      output.totals.ambiguousOwner++;
      per.ambiguousOwner++;
      if (output.ambiguousSamples.length < 30) output.ambiguousSamples.push({
        path, owners: [...uniqueOwners.keys()] });
      continue;
    }
    const variants = rows.filter(r => r.isPublic === true);
    if (!variants.length) {
      output.totals.matchedNotPublic++;
      per.matchedNotPublic++;
      if (output.staleSamples.length < 30) output.staleSamples.push(path);
      continue;
    }
    output.totals.inferredUniqueOwner++;
    per.inferredUniqueOwner++;
    const categories = new Set(variants.map(r => r.classification));
    if ([...categories].every(c => c === "previous-unverified-locale")) {
      output.totals.priorSlugOnly++;
      per.priorSlugOnly++;
      if (output.historicalOnlySamples.length < 30) output.historicalOnlySamples.push(path);
    } else if (categories.has("current-translated")) output.totals.inferredCurrentTranslation++;
    else output.totals.inferredBaseOrCrossLocale++;
  }
  output.totals.distinctSitemapPaths = seen.size;
  if (sitemap.count != null && sitemap.count !== urls.length) {
    output.notes.push("Sitemap reported count does not match input array size.");
  }
  console.log(JSON.stringify(output,null,2));
}
try { main(); } catch(err) {
  console.error("SEO_RECONCILIATION_FAILED:", err?.message || "UNKNOWN");
  process.exitCode=1;
}
