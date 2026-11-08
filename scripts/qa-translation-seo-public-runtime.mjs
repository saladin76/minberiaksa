// Functional public SEO rehearsal on a disposable CI-only site and MongoDB.
// Neither this process nor its Next.js child inherits production env or secrets.
// No user/financial records, external payments, emails, cron, or deployment.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const root = process.env.QA_MONGO_ROOT;
assert.equal(root, "/tmp/minber-translation-seo-mongo-qa", "CI QA root only");
assert.ok(process.cwd().startsWith(root + "/worktrees/"), "Must be an isolated QA checkout");
assert.equal(process.version.split(".")[0], "v24");
assert.equal(process.env.NODE_ENV, "test");
const requireQa = createRequire(path.join(root, "tools", "package.json"));
const { MongoMemoryReplSet } = requireQa("mongodb-memory-server-core");
const { PrismaClient } = await import("@prisma/client");

const LOCALES = ["ar", "tr", "en", "fr", "de", "es", "id", "pt", "ur", "sq", "it", "nl", "sv", "no", "da", "ms", "ja", "zh", "hi"];
assert.equal(new Set(LOCALES).size, 19);
const baseUrl = "http://127.0.0.1:3106";
const canonicalSite = "https://minberiaksa.org";
const summary = [];
const slug = "qa-seo-" + randomUUID().slice(0, 12);
const enSlug = slug + "-english";
const trSlug = slug + "-turkce";
let replica, prisma, server;
let serverLog = "";
let success = 0;
function safeLog(s) {
  return String(s).replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, "[fixture-db]").slice(-2500);
}
function pass(name) {
  summary.push(name);
  success++;
  console.log("PASS " + name);
}
function attr(tag, name) {
  const pair = [...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].find(match => match[1].toLowerCase() === name.toLowerCase());
  return pair?.[2] || "";
}
function headTags(html, kind) {
  const head = html.split("</head>", 1)[0];
  const matches = head.match(new RegExp("<" + kind + "\\b[^>]*>", "g")) || [];
  return matches;
}
function findLink(html, rel, extra = null) {
  return headTags(html, "link").map(tag => ({
    rel: attr(tag, "rel"),
    href: attr(tag, "href"),
    lang: attr(tag, "hreflang"),
  })).find(x => x.rel === rel && (extra === null || x.lang === extra));
}
function canon(html) {
  return findLink(html, "canonical")?.href || "";
}
function alternates(html) {
  return Object.fromEntries(headTags(html, "link").map(tag => ({
    rel: attr(tag, "rel"),
    href: attr(tag, "href"),
    lang: attr(tag, "hreflang"),
  })).filter(x => x.rel === "alternate" && x.lang).map(x => [x.lang, x.href]));
}
async function request(url, timeoutMs = 120000, redirect = "manual") {
  const parsed = new URL(url, baseUrl);
  assert.equal(parsed.origin, baseUrl, "Cannot request external hosts in CI QA");
  return fetch(parsed, {
    redirect,
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: "text/html,application/xml,text/plain", "user-agent": "Minber-QA-Preview/1" },
  });
}
async function get(pathname, timeoutMs = 120000, redirect = "manual") {
  const response = await request(pathname, timeoutMs, redirect);
  const body = await response.text();
  return { response, body };
}
async function check(name, fn) {
  await fn();
  pass(name);
}
async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null || server.signalCode !== null)
      throw new Error("Preview Next.js server exited before becoming ready: " + safeLog(serverLog));
    try {
      const result = await get("/robots.txt", 3000);
      if (result.response.status === 200) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  throw new Error("Preview Next.js did not become ready: " + safeLog(serverLog));
}
function hasNoindexHeader(response) {
  return /\bnoindex\b/i.test(response.headers.get("x-robots-tag") || "");
}
function xmlLocations(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
}
function urlEntries(xml) {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(match => {
    const segment = match[1];
    const loc = segment.match(/<loc>([^<]+)<\/loc>/)?.[1] || "";
    const links = Object.fromEntries(
      [...segment.matchAll(/<xhtml:link\b[^>]*\/>/g)].map(found => [attr(found[0], "hreflang"), attr(found[0], "href")])
    );
    return { loc, links };
  });
}
async function main() {
  fs.mkdirSync(path.join(root, "binaries"), { recursive: true });
  console.log("RUN ephemeral-public-seo-fixture");
  replica = await MongoMemoryReplSet.create({
    binary: { version: "8.0.28", downloadDir: path.join(root, "binaries") },
    replSet: { count: 1, name: "qa-public-seo", ip: "127.0.0.1", storageEngine: "wiredTiger" },
  });
  const dbName = "qa_public_seo_" + randomUUID().replaceAll("-", "").slice(0, 12);
  const databaseUrl = replica.getUri(dbName);
  const parsed = new URL(databaseUrl);
  assert.equal(parsed.hostname, "127.0.0.1");
  assert.equal(parsed.pathname, "/" + dbName);
  assert.ok(parsed.searchParams.has("replicaSet"));
  assert.ok(Number(parsed.port) > 1024 && ![27017, 27018].includes(Number(parsed.port)));
  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  await prisma.$connect();
  await check("isolated-mongodb-connected", async () => {
    assert.equal((await prisma.$runCommandRaw({ ping: 1 })).ok, 1);
  });

  const pageOverrides = Object.fromEntries(LOCALES.map(locale => [locale, {
    metaTitle: "Fixture home SEO " + locale,
    metaDescription: "Private CI preview metadata for " + locale,
    seoNoIndex: locale === "fr" ? "true" : "false",
  }]));
  await prisma.managedPageSeo.create({
    data: { key: "home", version: randomUUID(), overrides: pageOverrides },
  });
  await prisma.post.create({
    data: {
      title: "QA Arabic article", description: "Arabic QA summary",
      content: "<p>Test-only Arabic article</p>", published: true, slug,
      translations: { create: [
        { locale: "en", slug: enSlug, title: "QA English article",
          description: "English QA summary", content: "<p>English test article</p>",
          seoNoIndex: "false" },
        { locale: "tr", slug: trSlug, title: "QA Turkish article",
          description: "Turkish QA summary", content: "<p>Turkish test article</p>",
          seoNoIndex: "false" },
        { locale: "de", slug: slug + "-unindexed", title: "QA German article",
          description: "Excluded QA translation", content: "<p>German test article</p>",
          seoNoIndex: "true" },
      ] },
    },
  });
  await prisma.post.create({
    data: { title: "Unpublished QA article", description: "Never public",
      content: "<p>Private article</p>", published: false, slug: slug + "-draft" },
  });
  await check("seed-fixture-data-only", async () => {
    assert.equal(await prisma.post.count(), 2);
    assert.equal(await prisma.postTranslation.count(), 4 - 1);
    assert.equal(await prisma.user.count(), 0);
    assert.equal(await prisma.donation.count(), 0);
  });

  const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  assert.ok(fs.existsSync(nextBin), "Next CLI missing from isolated checkout");
  const env = {
    HOME: process.env.HOME,
    PATH: process.env.PATH,
    NODE_ENV: "development",
    DATABASE_URL: databaseUrl,
    SITE_INDEXING: "off",
    NEXTAUTH_URL: baseUrl,
    NEXTAUTH_SECRET: "qa-preview-secret-never-production",
    GOOGLE_CLIENT_ID: "fixture-google-id",
    GOOGLE_CLIENT_SECRET: "fixture-google-secret",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  server = spawn(process.execPath, [nextBin, "dev", "-p", "3106", "-H", "127.0.0.1"], {
    cwd: process.cwd(),
    env, detached: true, stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [server.stdout, server.stderr]) stream.on("data", data => {
    serverLog = (serverLog + data.toString()).slice(-14000);
  });
  await waitForServer();
  pass("next-preview-local-only-ready");

  await check("preview-robots-disallow-indexing", async () => {
    const { response, body } = await get("/robots.txt");
    assert.equal(response.status, 200);
    assert.match(body, /Disallow:\s*\//i);
    assert.ok(hasNoindexHeader(response), "Preview response must have noindex header");
  });
  await check("preview-19-locales-html-canonical-hreflang", async () => {
    for (const locale of LOCALES) {
      const { response, body } = await get("/" + locale);
      assert.equal(response.status, 200, "Home " + locale + " returned " + response.status);
      assert.ok(hasNoindexHeader(response), "Preview " + locale + " lacked X-Robots-Tag");
      assert.match(body.slice(0, 12000), new RegExp("<html[^>]*lang=\"" + locale + "\"[^>]*dir=\"" +
        (["ar", "ur"].includes(locale) ? "rtl" : "ltr") + "\""), "Wrong document language or direction: " + locale);
      assert.equal(canon(body), canonicalSite + "/" + locale, "Canonical error: " + locale);
      const map = alternates(body);
      assert.equal(map.ar, canonicalSite + "/ar", "Arabic alternate: " + locale);
      assert.equal(map["x-default"], canonicalSite + "/ar", "Default alternate: " + locale);
      assert.ok(!Object.hasOwn(map, "fr"), "Noindex French edition leaked into alternate: " + locale);
      assert.equal(Object.keys(map).length, 19, "Expect 18 indexable languages plus default: " + locale);
    }
  });
  await check("preview-sitemap-index-shards", async () => {
    const { response, body } = await get("/sitemap.xml");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /xml/);
    assert.ok(xmlLocations(body).includes(canonicalSite + "/sitemap/static.xml"));
    assert.ok(xmlLocations(body).includes(canonicalSite + "/sitemap/posts-0.xml"));
  });
  await check("preview-managed-page-noindex-removed-from-static-sitemap", async () => {
    const { response, body } = await get("/sitemap/static.xml");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /xml/);
    const entries = urlEntries(body);
    assert.ok(entries.some(e => e.loc === canonicalSite + "/ar"), "Arabic home missing from sitemap");
    assert.ok(!entries.some(e => e.loc === canonicalSite + "/fr"), "Noindex French home leaked into sitemap");
    const ar = entries.find(e => e.loc === canonicalSite + "/ar");
    assert.equal(ar.links.ar, canonicalSite + "/ar");
    assert.equal(ar.links["x-default"], canonicalSite + "/ar");
    assert.ok(!Object.hasOwn(ar.links, "fr"));
  });
  await check("preview-post-sitemap-reciprocal-and-draft-excluded", async () => {
    const { response, body } = await get("/sitemap/posts-0.xml");
    assert.equal(response.status, 200);
    const entries = urlEntries(body);
    assert.equal(entries.length, 3, "Only Arabic, English, Turkish should be indexed");
    const wanted = {
      ar: canonicalSite + "/ar/blog/" + slug,
      en: canonicalSite + "/en/blog/" + enSlug,
      tr: canonicalSite + "/tr/blog/" + trSlug,
    };
    for (const url of Object.values(wanted)) {
      const row = entries.find(e => e.loc === url);
      assert.ok(row, "Missing post sitemap URL: " + url);
      for (const [locale, target] of Object.entries(wanted)) assert.equal(row.links[locale], target);
      assert.equal(row.links["x-default"], wanted.ar);
      assert.ok(!Object.hasOwn(row.links, "de"));
    }
    assert.ok(!body.includes(slug + "-draft"), "Unpublished post leaked into sitemap");
  });
  await check("preview-post-html-canonical-per-language", async () => {
    const wanted = { ar: slug, en: enSlug, tr: trSlug };
    for (const [locale, pageSlug] of Object.entries(wanted)) {
      const { response, body } = await get("/" + locale + "/blog/" + pageSlug);
      assert.equal(response.status, 200, "Published post " + locale + " status " + response.status);
      assert.equal(canon(body), canonicalSite + "/" + locale + "/blog/" + pageSlug);
      const map = alternates(body);
      assert.equal(map.en, canonicalSite + "/en/blog/" + enSlug);
      assert.equal(map.ar, canonicalSite + "/ar/blog/" + slug);
      assert.equal(map.tr, canonicalSite + "/tr/blog/" + trSlug);
      assert.ok(!Object.hasOwn(map, "de"), "Noindex translation exposed in hreflang");
    }
  });
  await check("preview-unpublished-article-is-404", async () => {
    const { response } = await get("/ar/blog/" + slug + "-draft");
    assert.equal(response.status, 404);
  });
  await check("preview-legacy-301-preserves-tracking", async () => {
    const { response } = await get("/ar/monthly-donate?utm_source=qa&gclid=trace");
    assert.ok([301, 308].includes(response.status), "Expected permanent redirect");
    const loc = new URL(response.headers.get("location") || "", baseUrl);
    assert.equal(loc.pathname, "/ar/recurring-donation");
    assert.equal(loc.searchParams.get("utm_source"), "qa");
    assert.equal(loc.searchParams.get("gclid"), "trace");
  });
  await check("preview-duplicate-locale-redirect-does-not-loop", async () => {
    const { response } = await get("/ar/en/blog/" + slug + "?utm_campaign=qa");
    assert.equal(response.status, 301);
    const loc = new URL(response.headers.get("location") || "", baseUrl);
    assert.equal(loc.pathname, "/ar/blog/" + slug);
    assert.equal(loc.searchParams.get("utm_campaign"), "qa");
  });
  await check("preview-unknown-locale-not-public", async () => {
    const { response } = await get("/zz", 120000, "follow");
    assert.equal(response.status, 404, "Unknown locale must not serve a page");
  });
  console.log("PUBLIC_SEO_RUNTIME_PASSED=" + success);
  console.log("PUBLIC_SEO_RUNTIME_FAILURES=0");
  console.log("PUBLIC_SEO_RUNTIME_RESULT=PASS_LOCAL_CI_PREVIEW_NOT_LIVE_STAGING");
}
try {
  await main();
} catch (error) {
  const message = safeLog(error?.stack || error?.message || error);
  console.error("PUBLIC_SEO_RUNTIME_RESULT=FAILED_NO_MERGE_NO_DEPLOY");
  console.error("ERROR_SUMMARY=" + message);
  console.error("PUBLIC_SEO_RUNTIME_CHECKS_COMPLETED=" + success);
  console.error("NEXT_LOG_TAIL=" + safeLog(serverLog));
  process.exitCode = 1;
} finally {
  if (server?.pid) {
    try { process.kill(-server.pid, "SIGTERM"); } catch {
      try { server.kill("SIGTERM"); } catch {}
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    try { process.kill(-server.pid, "SIGKILL"); } catch {}
  }
  try { if (prisma) await prisma.$disconnect(); } catch {}
  try { if (replica) await replica.stop({ doCleanup: true, force: true }); } catch {}
  console.log("QA_NEXT_AND_MONGODB_CLEANUP_ATTEMPTED=YES");
}
