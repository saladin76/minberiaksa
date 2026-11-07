import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { SUPPORTED_LOCALES } from "../../lib/locales";
import { fieldsFor, validateChanges } from "../../lib/content-editor/contracts";
import { PAGE_SEO_FIELDS, managedSeoPage } from "../../lib/content-editor/page-seo-registry";

// Pure in-memory Prisma adapter. No database, network, production env or writes.
// We execute the actual page-seo service against this adapter to verify the
// 19-language Save All / readback / conflict boundary.
class ContentError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
type Stored = { key: string; version: string; overrides: Record<string, Record<string, string>> };
type Api = {
  readPageSeoDocument: (key: string) => Promise<{ key: string; revision: string | null; overrides: Record<string, Record<string, string>>; defaults: Record<string, unknown> }>;
  savePageSeoDocument: (key: string, revision: string | null, input: unknown) => Promise<{ key: string; revision: string | null; overrides: Record<string, Record<string, string>> }>;
};
function fixture() {
  let current: Stored | null = null, writes = 0, counter = 0;
  const prisma = {
    managedPageSeo: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        current && current.key === where.key ? structuredClone(current) : null,
      create: async ({ data }: { data: Stored }) => {
        if (current) throw Object.assign(new Error("Duplicate key"), { code: "P2002" });
        current = structuredClone(data); writes++;
      },
      updateMany: async ({ where, data }: { where: { key: string; version: string }; data: Pick<Stored, "version" | "overrides"> }) => {
        if (!current || current.key !== where.key || current.version !== where.version) return { count: 0 };
        current = { ...current, ...structuredClone(data) }; writes++;
        return { count: 1 };
      },
    },
  };
  const seo = Object.fromEntries(SUPPORTED_LOCALES.map(locale => [locale, {
    title: `Default title ${locale}`, description: `Default description ${locale}`,
    keywords: ["reviewed", locale],
  }]));
  const dependencies: Record<string, unknown> = {
    "./page-seo-sitemap": { filterPageSeoLanguages: (v: unknown) => v },
    "server-only": {},
    "node:crypto": { randomUUID: () => `fixture-revision-${++counter}` },
    "react": { cache: <T>(fn: T) => fn },
    "../prisma": { prisma },
    "../../i18n/locale-messages": { messagesFor: () => ({}) },
    "../seo": { LOCALE_SEO: seo, buildHreflang: () => ({}), buildPageMetadata: () => ({}) },
    "../locales": { SUPPORTED_LOCALES },
    "./public-seo": { applyEditorialSeo: (metadata: unknown) => metadata },
    "./contracts": { fieldsFor, validateChanges },
    "./service": { ContentError },
    "./page-seo-registry": { managedSeoPage, PAGE_SEO_FIELDS },
  };
  const loaded = { exports: {} as Api };
  const js = ts.transpileModule(fs.readFileSync("lib/content-editor/page-seo.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    exports: loaded.exports, module: loaded, console: { error() {} },
    require: (name: string) => {
      if (!(name in dependencies)) throw Error(`Unexpected import ${name}`);
      return dependencies[name];
    },
  });
  return {
    api: loaded.exports,
    writes: () => writes,
    stored: () => current ? structuredClone(current) : null,
  };
}
function allLocales() {
  return Object.fromEntries(SUPPORTED_LOCALES.map(locale => [locale, {
    metaTitle: `Reviewed ${locale} homepage SEO title`,
    metaDescription: `Reviewed ${locale} homepage SEO description with verified project information.`,
    seoNoIndex: "false",
  }]));
}
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

test("managed page SEO Save All persists and reads back all 19 locales atomically", async () => {
  const f = fixture(), draft = allLocales();
  assert.equal(SUPPORTED_LOCALES.length, 19);
  const saved = await f.api.savePageSeoDocument("home", null, draft);
  assert.equal(f.writes(), 1, "one datastore write for all locale overrides");
  assert.equal(Object.keys(saved.overrides).length, 19);
  assert.deepEqual(plain(saved.overrides), draft);
  assert.equal(Object.keys(saved.defaults).length, 19);

  const next = structuredClone(draft);
  next.ur.metaTitle = "Revised Urdu SEO title";
  next.ja.metaDescription = "Revised Japanese SEO description";
  const changed = await f.api.savePageSeoDocument("home", saved.revision, next);
  assert.equal(f.writes(), 2);
  assert.notEqual(changed.revision, saved.revision);
  const reread = await f.api.readPageSeoDocument("home");
  assert.deepEqual(plain(reread.overrides), next, "second read must contain all 19 saved locale values");
  assert.equal(reread.revision, changed.revision);
});

test("stale Save All, invalid locale and invalid SEO fields cannot alter already saved languages", async () => {
  const f = fixture(), first = await f.api.savePageSeoDocument("home", null, allLocales());
  const snapshot = f.stored();
  await assert.rejects(f.api.savePageSeoDocument("home", "stale-revision", allLocales()), error =>
    error instanceof ContentError && error.status === 409);
  await assert.rejects(f.api.savePageSeoDocument("home", first.revision, {
    ...allLocales(), xx: { metaTitle: "Unsupported locale" },
  }), /حقول أو لغات غير صالحة/);
  await assert.rejects(f.api.savePageSeoDocument("home", first.revision, {
    ...allLocales(), en: { unknownField: "Cannot be persisted" },
  }), /حقول أو لغات غير صالحة/);
  await assert.rejects(f.api.savePageSeoDocument("home", null, allLocales()), error =>
    error instanceof ContentError && error.status === 409);
  assert.equal(f.writes(), 1);
  assert.deepEqual(f.stored(), snapshot);
  assert.deepEqual(plain((await f.api.readPageSeoDocument("home")).overrides), allLocales());
});
