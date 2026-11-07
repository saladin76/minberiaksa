import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { suggestionFailure } from "../../lib/ai/core/suggestion-failure";

function fixture(file: string, mode = "ok") {
  const research: Record<string, unknown>[] = [], translations: Record<string, unknown>[] = [];
  class SeoResearchError extends Error { status = 502; }
  const deps: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, opts?: {status?: number}) => ({ body, status: opts?.status || 200 }) } },
    "next-auth": { getServerSession: async () => ({ user: {} }) }, "@/app/api/auth/[...nextauth]/options": {},
    "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: () => mode === "denied" ? {status:403} : null },
    "@/lib/locales": { isValidLocale: (locale: string) => ["ar", "en", "fr"].includes(locale) },
    "@/lib/ai/core/suggestion-failure": { suggestionFailure },
    "@/lib/content-editor/seo-research": { SeoResearchError, generateResearchedSeo: async (input: Record<string, unknown>) => {
      research.push(input); return {suggestion: { seoTitle: "Support", metaDescription: "Support families", primaryKeyword: "Support", keywords: [], longTailKeywords: [], faq: [], notes: [] }, research: { sources: [] }};
    } },
    "@/lib/content-localization/translate": { translateItem: async (input: Record<string, unknown>) => {
      translations.push(input); return { fields: mode === "rejected" ? {} : {title: "Support", text: "Support families"}, warnings: [] };
    } },
  };
  const loaded = {exports: {} as {POST: (request: unknown) => Promise<{status: number; body: Record<string, unknown>}>}};
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022} }).outputText;
  new vm.Script(source).runInNewContext({module: loaded, exports: loaded.exports, console: {error(){}}, require: (name: string) => { if (!(name in deps)) throw new Error(name); return deps[name]; }});
  return { research, translations, post: (body: unknown) => loaded.exports.POST({json: async () => body, signal: new AbortController().signal}) };
}
for (const tool of ["suggestions", "text-improve"]) test(`legacy ${tool} requires Arabic source and preserves access checks`, async () => {
  const path = `app/api/admin/seo/${tool}/route.ts`, h = fixture(path);
  const content = tool === "suggestions" ? {description: "دعم الأسر"} : {text: "دعم الأسر"};
  assert.equal((await h.post({type: "campaign", locale: "en", title: "Foreign", description: "Foreign", text: "Foreign"})).status, 400);
  assert.equal(h.research.length + h.translations.length, 0);
  const result = await h.post({type: "campaign", locale: "en", title: "Foreign", sourceDraft: {title: "دعم الأسر", ...content}});
  assert.equal(result.status, 200); assert.equal(h.research[0].title, "دعم الأسر"); assert.equal(h.research[0].locale, "en");
  assert.doesNotMatch(JSON.stringify(h.research), /Foreign/);
  assert.equal((await fixture(path, "denied").post({type:"campaign"})).status, 403);
});
test("legacy text improvement cannot report success or invent fallback content after a failed copy gate", async () => {
  const h = fixture("app/api/admin/seo/text-improve/route.ts", "rejected");
  assert.equal((await h.post({type: "campaign", locale: "ar", title: "دعم", text: "دعم الأسر"})).status, 422);
  assert.equal(h.research.length, 0); assert.equal(h.translations[0].mode, "proofread");
});
