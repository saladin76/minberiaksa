// Acceptance rehearsal against an ephemeral, loopback-only MongoDB replica set.
// The MongoDB server and npm tool live exclusively under QA_MONGO_ROOT.
// Runs the REAL content-editor service and page SEO service with the generated
// Prisma client. No production environment files, donor data, mail, cron,
// external payments, public bind or deployment.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import ts from "typescript";

const root = process.env.QA_MONGO_ROOT || "";
assert.match(root, /^\/root\/minber-media-recovery\/translation-seo-mongo-qa$/);
assert.ok(process.cwd().startsWith(root + "/worktrees/"), "Must run in a detached QA worktree");
assert.equal(process.env.NODE_ENV, "test");
assert.equal(process.version.split(".")[0], "v24");
const { MongoMemoryReplSet } = createRequire(path.join(root, "tools", "package.json"))("mongodb-memory-server-core");
const { PrismaClient } = await import("@prisma/client");
const { SUPPORTED_LOCALES } = await import("../lib/locales.ts");
const { fieldsFor, validateChanges } = await import("../lib/content-editor/contracts.ts");
const { saveWorkspace, fingerprint, readContent, documentFor, ContentError } = await import("../lib/content-editor/service.ts");
const { PAGE_SEO_FIELDS, managedSeoPage } = await import("../lib/content-editor/page-seo-registry.ts");
const json = value => JSON.parse(JSON.stringify(value));
const rich = value => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: value }] }] });
const locales = [...SUPPORTED_LOCALES];
assert.equal(locales.length, 19, "Expected all 19 public locales");
const dbName = "minber_qa_" + randomUUID().replaceAll("-", "").slice(0, 14);
const binaryDir = path.join(root, "binaries");
fs.mkdirSync(binaryDir, { recursive: true });
let replset, prisma;
let passed = 0;
function check(label, cb) {
  return Promise.resolve().then(cb).then(() => {
    passed++;
    console.log("PASS " + label);
  });
}
function adapter(client) {
  return {
    model(name) {
      assert.ok(client[name], "No model " + name);
      return client[name];
    },
    transaction(fn) {
      return typeof client.$transaction === "function"
        ? client.$transaction(tx => fn(adapter(tx)), { maxWait: 10000, timeout: 30000 })
        : fn(adapter(client));
    },
  };
}
function realPageSeoModule(client) {
  const defaults = Object.fromEntries(locales.map(locale => [locale, {
    title: "Default SEO " + locale, description: "Default page summary " + locale,
    keywords: ["reviewed"],
  }]));
  const module = { exports: {} };
  const deps = {
    "./page-seo-sitemap": { filterPageSeoLanguages: value => value },
    "server-only": {},
    "node:crypto": { randomUUID },
    "react": { cache: fn => fn },
    "../prisma": { prisma: client },
    "../../i18n/locale-messages": { messagesFor: () => ({}) },
    "../seo": { LOCALE_SEO: defaults, buildHreflang: () => ({}), buildPageMetadata: () => ({}) },
    "../locales": { SUPPORTED_LOCALES },
    "./public-seo": { applyEditorialSeo: value => value },
    "./contracts": { fieldsFor, validateChanges },
    "./service": { ContentError },
    "./page-seo-registry": { PAGE_SEO_FIELDS, managedSeoPage },
  };
  const source = fs.readFileSync("lib/content-editor/page-seo.ts", "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new vm.Script(js, { filename: "page-seo-service-under-test.js" }).runInNewContext({
    module, exports: module.exports,
    require(name) {
      assert.ok(Object.hasOwn(deps, name), "Unexpected page SEO import " + name);
      return deps[name];
    },
    console: { error() {} },
  });
  return module.exports;
}
try {
  // Official MongoDB 8 binary for Ubuntu 24.04; separate, temporary replica
  // set required for real Prisma MongoDB interactive transaction behavior.
  console.log("RUN ephemeral-mongodb-replica-set");
  replset = await MongoMemoryReplSet.create({
    binary: { version: "8.0.24", downloadDir: binaryDir },
    replSet: { count: 1, name: "qaonly", ip: "127.0.0.1", storageEngine: "wiredTiger" },
  });
  const uri = replset.getUri(dbName);
  const parsed = new URL(uri);
  assert.equal(parsed.protocol, "mongodb:");
  assert.equal(parsed.hostname, "127.0.0.1");
  assert.equal(parsed.pathname, "/" + dbName);
  assert.ok(Number(parsed.port) > 1024 && Number(parsed.port) !== 27017 && Number(parsed.port) !== 27018);
  assert.ok(parsed.searchParams.has("replicaSet"), "Must use MongoDB replica set");
  prisma = new PrismaClient({ datasources: { db: { url: uri } } });
  await prisma.$connect();
  const ping = await prisma.$runCommandRaw({ ping: 1 });
  assert.equal(ping.ok, 1);
  console.log("PASS ephemeral-mongodb-replica-set");
  passed++;
  const store = adapter(prisma);

  const sourceDoc = rich("Arabic source article body");
  const initial = await prisma.post.create({
    data: { title: "مقال اختبار مستقل", description: "وصف عربي تجريبي",
      content: sourceDoc, published: false, slug: "qa-article-" + randomUUID().slice(0, 8) },
  });
  const before = await readContent(store, "blog", initial.id);
  const draft = Object.fromEntries(locales.map(locale => [locale, {
    title: locale === "ar" ? "مقال مراجع للتجربة" : "Fixture article " + locale,
    description: locale === "ar" ? "ملخص عربي مراجع" : "Fixture summary " + locale,
    content: rich("Fixture rich body " + locale),
    metaTitle: "Fixture SEO " + locale,
    metaDescription: "Verified fixture-only content for locale " + locale,
  }]));
  await check("mongo-editor-save-all-19", async () => {
    const result = await saveWorkspace(store, {
      kind: "blog", id: initial.id, locale: "ar",
      revision: fingerprint(before),
      changes: draft.ar,
      localeChanges: Object.fromEntries(Object.entries(draft).filter(([code]) => code !== "ar")),
    });
    for (const locale of locales) {
      for (const [field, value] of Object.entries(draft[locale])) {
        assert.equal(result.values[locale][field], value, "Save returned " + locale + "." + field);
      }
    }
    const stored = await prisma.post.findUnique({ where: { id: initial.id }, include: { translations: true } });
    assert.equal(stored.translations.length, 18);
    assert.equal(stored.published, false);
    assert.equal(stored.slug, initial.slug, "No public slug rewrite");
  });
  await check("mongo-editor-fresh-process-readback", async () => {
    const record = await readContent(store, "blog", initial.id);
    const doc = documentFor("blog", record);
    for (const locale of locales) {
      for (const [field, value] of Object.entries(draft[locale]))
        assert.equal(doc.values[locale][field], value, "MongoDB readback " + locale + "." + field);
      assert.equal(doc.statuses[locale].complete, true);
    }
  });
  await check("mongo-editor-stale-revision-protection", async () => {
    await assert.rejects(saveWorkspace(store, {
      kind: "blog", id: initial.id, locale: "ar",
      revision: fingerprint(before), changes: { title: "Should never save" },
    }), error => error?.status === 409);
    const latest = await prisma.post.findUnique({ where: { id: initial.id } });
    assert.equal(latest.title, draft.ar.title);
    assert.equal(await prisma.postTranslation.count({ where: { postId: initial.id } }), 18);
  });
  await check("mongo-editor-atomic-rollback-on-invalid-19th-locale", async () => {
    const rollbackRow = await prisma.post.create({
      data: { title: "مقال التراجع", description: "قبل الحفظ",
        content: sourceDoc, published: false, slug: "qa-rollback-" + randomUUID().slice(0, 8) },
    });
    const original = await readContent(store, "blog", rollbackRow.id);
    const lateDraft = Object.fromEntries(locales.filter(code => code !== "ar").map(code => [
      code, { title: "Localized draft " + code, content: rich("Localized " + code) },
    ]));
    lateDraft.zh.metaTitle = "x".repeat(100);
    await assert.rejects(saveWorkspace(store, {
      kind: "blog", id: rollbackRow.id, locale: "ar",
      revision: fingerprint(original), changes: { title: "تعديل لم يحفظ" },
      localeChanges: lateDraft,
    }));
    const after = await readContent(store, "blog", rollbackRow.id);
    assert.equal(after.title, rollbackRow.title);
    assert.equal(await prisma.postTranslation.count({ where: { postId: rollbackRow.id } }), 0,
      "No language may survive aborted transaction");
  });

  const pageSeo = realPageSeoModule(prisma);
  const key = "home";
  const overrides = Object.fromEntries(locales.map(locale => [locale, {
    metaTitle: "Homepage title " + locale,
    metaDescription: "Fixture homepage SEO description " + locale,
    seoNoIndex: "false",
  }]));
  await check("mongo-page-seo-save-all-19", async () => {
    const saved = await pageSeo.savePageSeoDocument(key, null, overrides);
    assert.equal(Object.keys(saved.overrides).length, 19);
    const actual = await prisma.managedPageSeo.findUnique({ where: { key } });
    assert.equal(Object.keys(actual.overrides).length, 19);
    assert.deepEqual(json(actual.overrides.ar), overrides.ar);
  });
  let revision;
  await check("mongo-page-seo-readback-and-revision", async () => {
    const saved = await pageSeo.readPageSeoDocument(key);
    revision = saved.revision;
    assert.ok(revision);
    assert.deepEqual(json(saved.overrides), overrides);
    assert.equal(Object.keys(saved.defaults).length, 19);
    const modified = structuredClone(overrides);
    modified.ur.metaTitle = "Revised Urdu SEO";
    const updated = await pageSeo.savePageSeoDocument(key, revision, modified);
    assert.notEqual(updated.revision, revision);
    const reread = await pageSeo.readPageSeoDocument(key);
    assert.deepEqual(json(reread.overrides), modified);
    revision = updated.revision;
  });
  await check("mongo-page-seo-stale-revision-protection", async () => {
    await assert.rejects(pageSeo.savePageSeoDocument(key, "obsolete-version", overrides),
      error => error?.status === 409);
    const latest = await pageSeo.readPageSeoDocument(key);
    assert.equal(latest.revision, revision);
    assert.equal(latest.overrides.ur.metaTitle, "Revised Urdu SEO");
  });
  await check("mongo-page-seo-reject-unknown-locale-without-partial-write", async () => {
    const prior = await pageSeo.readPageSeoDocument(key);
    await assert.rejects(pageSeo.savePageSeoDocument(key, revision,
      { ...overrides, invalidLocale: { metaTitle: "Unapproved" } }),
      error => error?.status === 400);
    const after = await pageSeo.readPageSeoDocument(key);
    assert.deepEqual(json(after.overrides), json(prior.overrides));
  });
  await check("mongo-fixture-no-financial-data", async () => {
    assert.equal(await prisma.donation.count(), 0);
    assert.equal(await prisma.user.count(), 0);
  });
  console.log("MONGO_QA_CHECKS_PASSED=" + passed);
  console.log("MONGO_QA_FAILURES=0");
  console.log("STAGING_MONGO_RESULT=PASSED_REAL_TEMP_MONGODB_STORAGE_NOT_PUBLIC_STAGING");
} catch (error) {
  // Never expose connection strings or other error URLs in logs.
  const raw = String(error?.message || "Unknown rehearsal failure");
  const safe = raw.replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, "[qa-database-url]");
  console.error("STAGING_MONGO_RESULT=FAILED_NO_MERGE_NO_DEPLOY");
  console.error("ERROR_NAME=" + String(error?.name || "Unknown"));
  console.error("ERROR_SUMMARY=" + safe.slice(0, 500));
  process.exitCode = 1;
} finally {
  try { if (prisma) await prisma.$disconnect(); } catch {}
  try { if (replset) await replset.stop({ doCleanup: true, force: true }); } catch {}
  console.log("TEMP_MONGODB_STOPPED_AND_CLEANUP_ATTEMPTED=YES");
}
