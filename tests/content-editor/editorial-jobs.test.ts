import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { randomUUID } from "node:crypto";
import * as contracts from "../../lib/content-editor/contracts";
import * as faq from "../../lib/content-editor/faq";
import * as editorial from "../../lib/content-editor/editorial-contracts";
import { suggestionFailure } from "../../lib/ai/core/suggestion-failure";
import * as failure from "../../lib/content-editor/editorial-failure";
import { ContentError, fingerprint } from "../../lib/content-editor/service";
import type { ContentRecord } from "../../lib/content-editor/contracts";
type JobApi = { editorialFailureReview: (reason?: failure.EditorialFailureKind) => Promise<{summary:{scanned:number;eligible:number;blocked:number;truncated:boolean};matchingIds?:string[]}>; runEditorialJobs: () => Promise<unknown[]>; retryTransientEditorialJobs: () => Promise<{count:number;blocked:number;remaining:number}>; applyEditorialJob: (id: string, version: string, input: unknown) => Promise<{ contentId: string }> };
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
    findMany: async (args: { where?: ContentRecord }) => args.where?.kind === "ARTICLE" ? [] : args.where?.status === "FAILED" ? (job.status === "FAILED" ? [structuredClone(job)] : []) : job.status === "QUEUED" ? [structuredClone(job)] : [],
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
    "../ai/core/connection-settings": { getOpenAiRuntime: async () => ({ apiKey: options.configured === false ? null : "test-key" }) },
    "server-only": {}, "node:crypto": { randomUUID },
    "../prisma": { prisma: {
      editorialSettings: { upsert: async () => ({}), findUnique: async () => ({ weeklyEnabled: true, market: "" }), updateMany: async (args: { where: ContentRecord }) => ({ count: options.locked && "OR" in args.where ? 0 : 1 }) },
      editorialJob: jobModel, post: { findMany: async () => [] }, campaign: { findMany: async () => [] },
    } },
    "../../i18n/locale-messages": { messagesFor: () => ({ about: {} }) },
    "../locales": { SUPPORTED_LOCALES: ["ar", "en", "tr"] },
    "../ai/core/suggestion-failure": { suggestionFailure },
    "./contracts": contracts, "./faq": faq, "./editorial-contracts": editorial, "./editorial-failure": failure,
    "./service": { ContentError, fingerprint, readContent: async () => structuredClone(row),
      saveWorkspace: async (_tx: unknown, input: { locale: string; changes: ContentRecord }) => { writes++; const target = (row.translations as ContentRecord[]).find((target) => target.locale === input.locale); if (target) Object.assign(target, input.changes); return {}; } },
    "./store": { contentStore: store },
    "./create": { createWorkspace: async (_tx: unknown, input: { settings: ContentRecord; locale: string }) => { assert.equal(input.settings.published, false); assert.equal(input.locale, "ar"); creations++; return { id: sourceId }; } },
    "../content-localization/research-translate": { translateResearchedItem: async () => { providerCalls++; return { translation: { fields: {}, richFields: { content: "Translated body" }, warnings: [] }, research: { sources: [{ url: "https://example.org/source" }] } }; } },
    "./seo-research": { SeoResearchError: class SeoResearchError extends Error {}, generateResearchedArticle: async () => { providerCalls++; return { values: { title: "موضوع جديد", content: "محتوى المقال", description: "ملخص" }, notes: [], research: { sources: [] } }; } },
  };
  const source = readFileSync("lib/content-editor/editorial-jobs.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const isolatedModule = { exports: {} as JobApi };
  new vm.Script(compiled).runInNewContext({ module: isolatedModule, exports: isolatedModule.exports, process: { env: options.configured === false ? {} : { OPENAI_API_KEY: "test-only" } }, require: (name: string) => {
    if (!(name in dependencies)) throw new Error("Unexpected dependency: " + name); return dependencies[name];
  } });
  return { api: isolatedModule.exports, job: () => structuredClone(job), stats: () => ({ writes, creations, providerCalls }),
    failJob: (error: string, attempts = 1) => { job.status = "FAILED"; job.error = error; job.attempts = attempts; job.updatedAt = new Date("2026-10-01T00:00:00Z"); },
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

 test("batch retry leaves request, access and billing failures for individual review", async () => {
 for (const error of ["رفض المزوّد صيغة الطلب (400)","AI_ACCESS_DENIED (403)","AI_QUOTA_EXCEEDED (429)"]) {
 const f=fixture();f.failJob(error);const result=await f.api.retryTransientEditorialJobs();
 assert.equal(result.count,0);assert.equal(result.blocked,1);assert.equal(f.job().status,"FAILED");assert.equal(f.stats().providerCalls,0);
 }
 });
 test("transient editorial retries are queued once without generating or publishing content",async()=>{
 const f=fixture();f.failJob("AI_PROVIDER_UNAVAILABLE (503)");assert.equal((await f.api.retryTransientEditorialJobs()).count,1);
 assert.equal(f.job().status,"QUEUED");assert.equal((await f.api.retryTransientEditorialJobs()).count,0);assert.equal(f.stats().providerCalls,0);assert.equal(f.stats().writes,0);
 const exhausted=fixture();exhausted.failJob("AI_TIMEOUT",3);assert.equal((await exhausted.api.retryTransientEditorialJobs()).count,0);
 });


test("failure review is read-only and selects ids only for the requested reason", async () => {
  const f = fixture(); f.failJob("AI_ACCESS_DENIED (403)");
  const all = await f.api.editorialFailureReview(); assert.equal(all.summary.scanned,1); assert.equal(all.summary.blocked,1); assert.equal(all.summary.eligible,0); assert.equal(all.summary.truncated,false); assert.equal(all.matchingIds,undefined);
  assert.deepEqual((await f.api.editorialFailureReview("access")).matchingIds,[jobId]);
  assert.deepEqual((await f.api.editorialFailureReview("temporary")).matchingIds,[]);
  assert.equal(f.stats().providerCalls,0); assert.equal(f.stats().writes,0); assert.equal(f.job().status,"FAILED");
});
