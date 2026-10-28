import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as contracts from "../../lib/content-editor/contracts";
import * as locales from "../../lib/locales";
import { ContentError } from "../../lib/content-editor/service";
import { suggestionFailure } from "../../lib/ai/core/suggestion-failure";
import { OpenAiResponseError } from "../../lib/ai/core/openai-response";
function load(file: string, deps: Record<string, unknown>) {
  const loaded = { exports: {} as Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>> };
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(source).runInNewContext({ module: loaded, exports: loaded.exports, console: { error() {} }, require: (key: string) => { if (!(key in deps)) throw new Error(key); return deps[key]; } });
  return loaded.exports;
}
function fixture(mode = "ok") {
  let reads = 0, writes = 0;
  const calls: Record<string, unknown>[] = [];
  const document = { key: "home", revision: "saved", overrides: { ar: { metaTitle: "Saved override" } } };
  const pageSeo = load("lib/content-editor/page-seo.ts", {
    "./page-seo-sitemap": {}, "server-only": {}, "node:crypto": {}, "react": { cache: (fn: unknown) => fn }, "../prisma": {}, "../../i18n/locale-messages": {}, "../seo": {}, "../locales": locales, "./public-seo": {}, "./contracts": contracts, "./service": { ContentError }, "./page-seo-registry": { PAGE_SEO_FIELDS: [["metaTitle"], ["metaDescription"]] },
  });
  class SeoResearchError extends Error { status = 502; }
  class Ga4ReportError extends Error { status = 502; }
  const route = load("app/api/admin/page-seo/[key]/route.ts", {
    "@/lib/ai/core/suggestion-failure": { suggestionFailure }, "next/server": { NextResponse: { json: (body: unknown, options?: {status?:number}) => ({ body, status: options?.status || 200 }) } },
    "next-auth": { getServerSession: async () => ({user:{}}) }, "@/app/api/auth/[...nextauth]/options": {authOptions:{}}, "@/lib/dashboard/api-auth": {requireAdminOrDashboardPermission:()=>mode==="denied"?{status:403}:null},
    "@/lib/content-editor/service": {ContentError}, "@/lib/content-editor/page-seo": {...pageSeo, readPageSeoDocument:async()=>{reads++;return document;}, savePageSeoDocument:async()=>{writes++;throw new Error("Unexpected write");},pageSeoDefaults:()=>({values:{metaTitle:"Default title",metaDescription:"Default description"},context:"Public page context"})},
    "@/lib/content-editor/seo-research": {SeoResearchError,generateResearchedSeo:async(input:Record<string,unknown>)=>{calls.push(input);if(mode==="quota")throw new OpenAiResponseError("AI_QUOTA_EXCEEDED");return {suggestion:{seoTitle:"Proposal",metaDescription:"Description",primaryKeyword:"Keyword",altText:"Alt"},research:{sources:[]}};}},
    "@/lib/content-editor/page-seo-registry": {}, "@/lib/marketing/ga4-period": {}, "@/lib/marketing/ga4-server": {Ga4ReportError}, "@/lib/marketing/ga4-seo": {}, "@/lib/locales": locales, "next/cache": {}, "@/lib/audit-log": {},
  });
  return { document, calls, stats:()=>({reads,writes}), post:(body:unknown)=>route.POST({json:async()=>body,signal:new AbortController().signal},{params:Promise.resolve({key:"home"})}) };
}
test("page SEO research uses a validated unsaved snapshot without writing or changing overrides",async()=>{
  const h=fixture(),before=structuredClone(h.document);
  const result=await h.post({locale:"ar",revision:"saved",draft:{metaTitle:"Unsaved title",metaDescription:""}});
  assert.equal(result.status,200);assert.equal(h.calls[0].title,"Unsaved title");assert.match(String(h.calls[0].description),/^Default description/);assert.deepEqual(h.document,before);assert.equal(h.stats().writes,0);
  assert.equal((result.body as Record<string,unknown>).revision,"saved");
});
test("page SEO keeps saved overrides for legacy callers and refuses stale or unauthorized requests before generation",async()=>{
  const h=fixture();assert.equal((await h.post({locale:"ar",revision:"saved"})).status,200);assert.equal(h.calls[0].title,"Saved override");
  assert.equal((await h.post({locale:"ar",revision:"stale",draft:{metaTitle:"Draft"}})).status,409);assert.equal(h.calls.length,1);
  const denied=fixture("denied");assert.equal((await denied.post({})).status,403);assert.equal(denied.stats().reads,0);
});
test("invalid SEO draft fields never reach the provider and quota errors retain their controlled reason",async()=>{
  const h=fixture();assert.equal((await h.post({locale:"ar",revision:"saved",draft:{amount:"1"}})).status,400);assert.equal(h.calls.length,0);
  const result=await fixture("quota").post({locale:"ar",revision:"saved"});assert.equal(result.status,502);assert.equal((result.body as Record<string,unknown>).reason,"AI_QUOTA_EXCEEDED");
});
