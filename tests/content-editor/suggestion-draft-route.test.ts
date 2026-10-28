import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as contracts from "../../lib/content-editor/contracts";
import { ContentError } from "../../lib/content-editor/service";
import { suggestionFailure } from "../../lib/ai/core/suggestion-failure";
import { OpenAiResponseError } from "../../lib/ai/core/openai-response";

function fixture(mode = "ok") {
  const row = { id: "111111111111111111111111", title: "Saved Arabic title", description: "Saved source", translations: [{ locale: "en", title: "Saved English title", description: "Saved English copy" }] };
  const calls: { translations: unknown[]; research: Record<string, unknown>[]; reads: number } = { translations: [], research: [], reads: 0 };
  class SeoResearchError extends Error { status = 502; }
  const deps: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, options?: { status?: number }) => ({ body, status: options?.status || 200 }) } },
    "next-auth": { getServerSession: async () => ({ user: {} }) }, "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: () => mode === "denied" ? { status: 403 } : null },
    "@/lib/ai/core/suggestion-failure": { suggestionFailure }, "@/lib/content-editor/contracts": contracts,
    "@/lib/content-editor/service": { ContentError, readContent: async () => { calls.reads++; return row; }, fingerprint: () => "revision", documentFor: () => ({ slugs: {} }) },
    "@/lib/content-editor/store": { contentStore: {} }, "@/lib/locales": { isValidLocale: (value: string) => ["ar", "en", "fr"].includes(value) },
    "@/lib/content-localization/translate": { translateItem: async () => ({ fields: {}, richFields: {}, warnings: [] }) },
    "@/lib/content-localization/research-translate": { translateResearchedItem: async (input: unknown) => { calls.translations.push(input); if (mode === "quota") throw new OpenAiResponseError("AI_QUOTA_EXCEEDED"); return { translation: { fields: { title: "Reviewed translation" }, richFields: {}, warnings: [] }, research: { sources: [] } }; } },
    "@/lib/content-editor/seo-research": { SeoResearchError, generateResearchedSeo: async (input: Record<string, unknown>) => { calls.research.push(input); return { suggestion: { seoTitle: "Proposal", metaDescription: "Proposal description", primaryKeyword: "Keyword", altText: "Alt", faq: [], notes: [] }, research: { sources: [] } }; } },
    "@/lib/content-editor/faq": { faqTranslationFields: () => ({}), translatedFaq: () => null },
    "@/lib/marketing/ga4-period": {}, "@/lib/marketing/ga4-server": {}, "@/lib/marketing/ga4-seo": {},
  };
  const loaded = { exports: {} as { POST: (request: unknown, context: unknown) => Promise<{ status: number; body: Record<string, unknown> }> } };
  const source = ts.transpileModule(fs.readFileSync("app/api/admin/content-editor/[kind]/[id]/suggest/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(source).runInNewContext({ module: loaded, exports: loaded.exports, console: { error: () => {} }, require: (id: string) => { if (!(id in deps)) throw new Error(id); return deps[id]; } });
  return { row, calls, post: (body: unknown) => loaded.exports.POST({ json: async () => body, signal: new AbortController().signal }, { params: Promise.resolve({ kind: "campaigns", id: row.id }) }) };
}
test("translation uses the unsaved Arabic snapshot and never mutates saved content", async () => {
  const h = fixture(), original = structuredClone(h.row);
  const result = await h.post({ action: "translate", locales: ["fr"], locale: "fr", keys: ["title", "description"], revision: "revision", sourceDraft: { title: "Unsaved Arabic title", description: "Unsaved source" } });
  assert.equal(result.status, 200); assert.deepEqual(h.row, original);
  const input = h.calls.translations[0] as { fields: Record<string, string>; richFields: Record<string, string> };
  assert.deepEqual(JSON.parse(JSON.stringify({ ...input.fields, ...input.richFields })), { title: "Unsaved Arabic title", description: "Unsaved source" });
});
test("SEO uses an unsaved language draft while keeping revision and authorization checks", async () => {
  const h = fixture();
  assert.equal((await h.post({ action: "seo", locale: "en", revision: "revision", draft: { title: "Unsaved English title", description: "Current draft copy" } })).status, 200);
  assert.equal(h.calls.research[0].title, "Unsaved English title"); assert.match(String(h.calls.research[0].description), /Current draft copy/);
  assert.equal((await h.post({ action: "seo", locale: "en", revision: "stale" })).status, 409); assert.equal(h.calls.research.length, 1);
  const denied = fixture("denied"); assert.equal((await denied.post({})).status, 403); assert.equal(denied.calls.reads, 0);
});
test("invalid draft fields are rejected before any provider request", async () => {
  const h = fixture(); const result = await h.post({ action: "translate", locales: ["fr"], revision: "revision", sourceDraft: { amount: "1" } });
  assert.equal(result.status, 400); assert.equal(h.calls.translations.length, 0);
});
test("translation quota failures expose a controlled actionable reason without provider details", async () => {
  const result = await fixture("quota").post({ action: "translate", locales: ["fr"], keys: ["title"], revision: "revision" });
  assert.equal(result.status, 502); assert.equal(result.body.reason, "AI_QUOTA_EXCEEDED"); assert.equal(result.body.stopBatch, true);
  assert.match(String(result.body.error), /رصيد|فوترة/);
});
