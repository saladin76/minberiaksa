#!/usr/bin/env node
/**
 * Read-only public URL inventory for Minber Al-Aqsa.
 *
 * Usage:
 *   node scripts/qa-public-url-inventory.mjs
 *   node scripts/qa-public-url-inventory.mjs --check --limit=80
 *
 * --check makes bounded HEAD/GET requests to public pages only. Never checks
 * donor, payment, account, dashboard or API routes. No DB or provider access.
 * Does not modify slugs, ads, donation records, PM2, or deployment.
 */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const ORIGIN = "https://minberiaksa.org";
const MAX_SHARDS = 200;
const MAX_URLS = 20000;
const PRIVATE_PATH_RE = /\/(?:api|dashboard|account|profile|cart|checkout|payment(?:-(?:failed|cancelled|processing|pending))?|receipt|success|certificates|auth|donation-failed)(?:\/|$)/i;

export function locs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)]
    .map((match) => match[1].trim().replace(/&amp;/g, "&"));
}
export function safePublicUrl(value, origin = ORIGIN) {
  try {
    const url = new URL(value);
    if (url.origin !== origin || url.username || url.password ||
        !/^https:$/.test(url.protocol) || PRIVATE_PATH_RE.test(url.pathname)) return null;
    return url;
  } catch { return null; }
}
export function queryRetained(before, after) {
  const source = new URL(before);
  const destination = new URL(after);
  for (const [key, value] of source.searchParams) {
    if (!destination.searchParams.getAll(key).includes(value)) return false;
  }
  return true;
}
export const LEGACY_AD_PROBES = [
  "/ar/ghr", "/ar/monthly-donate",
  "/ar/donates", "/donates", "/ar/المشاريع",
  "/en/projects", "/tr/projects", "/fr/projects",
  "/ar/relief-in-gaza",
];

async function retrieve(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(12000),
    headers: { "user-agent": "Minber-Readonly-URL-Audit/1.0" },
  });
  return response;
}
function urlFromLocation(current, location) {
  try { return new URL(location, current).toString(); }
  catch { return null; }
}
export async function resolveRedirect(initial, fetcher = retrieve, maxHops = 5) {
  let url = initial;
  const hops = [];
  for (let n = 0; n < maxHops; n++) {
    const current = safePublicUrl(url);
    if (!current) return { status: "UNSAFE", hops };
    let response;
    try { response = await fetcher(url, { method: "HEAD" }); }
    catch (error) { return { status: "ERROR", error: String(error).slice(0,100), hops }; }
    const code = response.status;
    if (code < 300 || code >= 400) return { status: code, finalUrl: url, hops };
    const location = response.headers.get("location");
    const next = location && urlFromLocation(url, location);
    if (!next) return { status: "REDIRECT_WITHOUT_LOCATION", hops };
    hops.push({ from: new URL(url).pathname, code, to: new URL(next).pathname,
      retainedQuery: queryRetained(url, next) });
    if (!queryRetained(url, next)) return { status: "QUERY_LOST", hops };
    url = next;
  }
  return { status: "TOO_MANY_REDIRECTS", hops };
}

async function main() {
  const check = process.argv.includes("--check");
  const limit = Math.min(150, Math.max(1, Number(process.argv.find(arg => arg.startsWith("--limit="))?.split("=")[1] || "60")));
  const sitemapIndex = await retrieve(ORIGIN + "/sitemap.xml");
  if (!sitemapIndex.ok) throw new Error("SITEMAP_INDEX_HTTP_" + sitemapIndex.status);
  const index = await sitemapIndex.text();
  const shards = locs(index).map(x => safePublicUrl(x)).filter(Boolean)
    .map(url => url.toString()).slice(0, MAX_SHARDS);
  if (!shards.length) throw new Error("EMPTY_SITEMAP_INDEX");

  const urls = new Set();
  const shardErrors = [];
  for (const shard of shards) {
    try {
      const res = await retrieve(shard);
      if (!res.ok) { shardErrors.push({ shard: new URL(shard).pathname, status: res.status }); continue; }
      const xml = await res.text();
      for (const raw of locs(xml)) {
        const url = safePublicUrl(raw);
        if (url) urls.add(url.toString());
        if (urls.size >= MAX_URLS) break;
      }
    } catch(error) {
      shardErrors.push({ shard: new URL(shard).pathname, error: String(error).slice(0,80) });
    }
    if (urls.size >= MAX_URLS) break;
  }
  const byLocale = {};
  const byKind = {};
  const list = [...urls].sort();
  for (const item of list) {
    const pathname = new URL(item).pathname;
    const locale = pathname.match(/^\/([a-z]{2})(?:\/|$)/)?.[1] || "other";
    byLocale[locale] = (byLocale[locale] || 0) + 1;
    const tail = pathname.replace(/^\/[a-z]{2}(?:\/|$)/, "/");
    const kind = tail.startsWith("/bagislar/") ? "projects_and_major_sections"
      : tail.startsWith("/category/") ? "categories"
      : tail.startsWith("/blog/") ? "blog_posts"
      : tail.startsWith("/blog") ? "blog"
      : "other_public_pages";
    byKind[kind] = (byKind[kind] || 0) + 1;
  }
  const report = {
    asOf: new Date().toISOString(), source: ORIGIN + "/sitemap.xml",
    sitemapShards: shards.length, indexedPublicUrls: list.length,
    byLocale, byKind, shardErrors,
    note: "Sitemap inventory only: exclude noindex URLs and URLs not published to sitemap; production CMS and ad-account inventory must be reconciled separately.",
  };
  if (check) {
    const sample = list.filter((_, i) => i % Math.max(1, Math.ceil(list.length / limit)) === 0).slice(0, limit);
    const checks = [];
    for (const item of [...LEGACY_AD_PROBES.map(p => ORIGIN + p + "?utm_source=qa_inventory&utm_campaign=readonly_probe&gclid=TESTONLY"), ...sample]) {
      const output = await resolveRedirect(item);
      checks.push({ source: new URL(item).pathname, ...output });
    }
    report.checked = checks.length;
    report.failures = checks.filter(x => x.status !== 200);
    report.queryLoss = checks.filter(x => x.hops?.some(h => !h.retainedQuery));
    report.redirectChains = checks.filter(x => (x.hops?.length || 0) > 1);
  }
  console.log(JSON.stringify(report, null, 2));
  if (shardErrors.length || report.queryLoss?.length || report.failures?.length) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(e => { console.error(String(e)); process.exitCode = 1; });
}
