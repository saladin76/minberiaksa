import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { randomUUID } from "node:crypto";
import * as contracts from "../../lib/content-editor/contracts";
import * as faq from "../../lib/content-editor/faq";
import * as editorial from "../../lib/content-editor/editorial-contracts";
import { ContentError, fingerprint } from "../../lib/content-editor/service";
import type { ContentRecord } from "../../lib/content-editor/contracts";
type JobApi = { runEditorialJobs: () => Promise<unknown[]>; applyEditorialJob: (id: string, version: string, input: unknown) => Promise<{ contentId: string }> };
const sourceId = "111111111111111111111111", jobId = "222222222222222222222222";
function fixture(options: { locked?: boolean; configured?: boolean; kind?: string } = {}) {
  let row: ContentRecord = { id: sourceId, title: "عنوان المقال", description: "وصف", content: "نص عربي مكتمل", translations: [{ locale: "en", title: "Title", description: "Description", content: "" }] };
  let job: ContentRecord = {
    id: jobId, key: "test", kind: options.kind || "TRANSLATION", status: "QUEUED", version: "initial",
    locale: options.kind === "ARTICLE" ? "ar" : "en", sourceId: options.kind === "ARTICLE" ? null : sourceId,
    sourceRevision: fingerprint(contracts.valuesFor("blog", row, "ar")), targetRevision: fingerprint(contracts.valuesFor("blog", row, "en")),
    fields: ["content"], creationKey: randomUUID(),
  };
  let providerCalls = 0, writes = 0, creations = 0;
  const matches = (where: ContentRecord) => (!where.id || where.id === job.id) && (!where.version || where.version === job.version) && (!where.status || where.status === job.status) && (!where.leaseToken || where.leaseToken === job.leaseToken);
  const jobModel = {
    findUnique: async () => structuredClone(job),
    findMany: async (args: { where?: ContentRecord }) => args.where?.kind === "ARTICLE" ? [] : job.status === "QUEUED" ? [structuredClone(job)] : [],
    updateMany: async (args: { where: ContentRecord; data: ContentRecord }) => {
      if (!matches(args.where)) return { count: 0 };
      Object.assign(job, args.data); return { count: 1 };
    },
    update: async (args: { where: ContentRecord; data: ContentRecord }) => {
      if (!matches(args.where)) throw new Error("job changed");
      Object.assign(job, args.data); return job;
    },
  };
  const store = {
    model: () => jobModel,
    transaction: async (operation: (tx: unknown) => Promise<unknown>) => {
      const previousJob = structuredClone(job), previousRow = structuredClone(row), previousWrites = writes;
      try { return await operation(store); } catch (error) { job = previousJob; row = previousRow; writes = previousWrites; throw error; }
    },
  };
  const dependencies: Record<string, unknown> = {
    "server-only": {}, "node:crypto": { randomUUID },
    "../prisma": { prisma: {
      editorialSettings: { upsert: async () => ({}), findUnique: async () => ({ weeklyEnabled: true, market: "" }), updateMany: async (args: { where: ContentRecord }) => ({ count: options.locked && "OR" in args.where ? 0 : 1 }) },
      editorialJob: jobModel, post: { findMany: async () => [] }, campaign: { findMany: async () => [] },
    } },
    "../../i18n/locale-messages": { messagesFor: () => ({ about: {} }) },
    "../locales": { SUPPORTED_LOCALES: ["ar", "en", "tr"] },
    "./contracts": contracts, "./faq": faq, "./editorial-contracts": editorial,
    "./service": { ContentError, fingerprint, readContent: async () => structuredClone(row),
      saveWorkspace: async (_tx: unknown, input: { locale: string; changes: ContentRecord }) => { writes++; const target = (row.translations as ContentRecord[]).find((target) => target.locale === input.locale); if (target) Object.assign(target, input.changes); return {}; } },
    "./store": { contentStore: store },
    "./create": { createWorkspace: async (_tx: unknown, input: { settings: ContentRecord; locale: string }) => { assert.equal(input.settings.published, false); assert.equal(input.locale, "ar"); creations++; return { id: sourceId }; } },
    "../content-localization/research-translate": { translateResearchedItem: async () => { providerCalls++; return { translation: { fields: {}, richFields: { content: "Translated body" }, warnings: [] }, research: { sources: [{ url: "https://example.org/source" }] } }; } },
    "./seo-research": { generateResearchedArticle: async () => { providerCalls++; return { values: { title: "موضوع جديد", content: "محتوى المقال", description: "ملخص" }, notes: [], research: { sources: [] } }; } },
  };
  const source = readFileSync("lib/content-editor/editorial-jobs.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const isolatedModule = { exports: {} as JobApi };
  new vm.Script(compiled).runInNewContext({ module: isolatedModule, exports: isolatedModule.exports, process: { env: options.configured === false ? {} : { OPENAI_API_KEY: "test-only" } }, require: (name: string) => {
    if (!(name in dependencies)) throw new Error("Unexpected dependency: " + name); return dependencies[name];
  } });
  return { api: isolatedModule.exports, job: () => structuredClone(job), stats: () => ({ writes, creations, providerCalls }),
    changeSource: () => { row.content = "تحرير أحدث"; },
    changeTarget: () => { (row.translations as ContentRecord[])[0].content = "Human edit"; },
  };
}
test("workers produce review proposals without changing live article content", async () => {
  const f = fixture(); await f.api.runEditorialJobs();
  assert.equal(f.job().status, "REVIEW");
  assert.deepEqual(f.stats(), { writes: 0, creations: 0, providerCalls: 1 });
});
test("review application preserves source and target edits made after generation", async () => {
  for (const edit of ["changeSource", "changeTarget"] as const) {
    const f = fixture(); await f.api.runEditorialJobs(); f[edit]();
    await assert.rejects(() => f.api.applyEditorialJob(jobId, String(f.job().version), { content: "Translated body" }), /تغير المصدر/);
    assert.equal(f.stats().writes, 0);
  }
});
test("translation approval permits only the requested missing fields", async () => {
  const f = fixture(); await f.api.runEditorialJobs();
  await assert.rejects(() => f.api.applyEditorialJob(jobId, String(f.job().version), { content: "Translated", title: "Overwrite" }), /الحقول المطلوبة/);
  await assert.rejects(() => f.api.applyEditorialJob(jobId, String(f.job().version), { baselineAmount: 100 }), /حقول مراجعة غير صالحة/);
  assert.equal(f.stats().writes, 0);
});
test("approving a generated article creates one unpublished draft and is idempotent", async () => {
  const f = fixture({ kind: "ARTICLE" }); await f.api.runEditorialJobs();
  const version = String(f.job().version);
  const first = await f.api.applyEditorialJob(jobId, version, { title: "موضوع جديد", content: "نص المقال" });
  const second = await f.api.applyEditorialJob(jobId, version, { title: "موضوع جديد", content: "نص المقال" });
  assert.equal(first.contentId, second.contentId);
  assert.equal(f.stats().creations, 1);
  assert.equal(f.stats().writes, 0);
});
test("an active runner lease or missing provider configuration leaves work queued", async () => {
  for (const options of [{ locked: true }, { configured: false }]) {
    const f = fixture(options); assert.equal((await f.api.runEditorialJobs()).length, 0);
    assert.equal(f.job().status, "QUEUED"); assert.equal(f.stats().providerCalls, 0);
  }
});
