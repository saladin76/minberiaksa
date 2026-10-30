import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as preview from "../../lib/content-editor/public-preview";
import { preparePreviewDraft } from "../../lib/content-editor/preview-draft";
import * as contracts from "../../lib/content-editor/contracts";
import * as locales from "../../lib/locales";
import * as account from "../../lib/dashboard/donor-account";
import * as demographics from "../../lib/dashboard/user-demographics";
import * as translation from "../../lib/i18n/translation-fallback";
import { BLOCK_SOURCE_KIND } from "../../lib/content/super-category-write";

function load<T>(file: string, dependencies: Record<string, unknown>): T {
  const loaded = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new vm.Script(source).runInNewContext({ module: loaded, exports: loaded.exports, Date, Map, Set, URL, console: { error() {} }, require: (id: string) => { if (!(id in dependencies)) throw new Error(id); return dependencies[id]; } });
  return loaded.exports as T;
}

test("localized preview changes are isolated from saved rows and unknown or unsafe fields are refused", () => {
  const row = { title: "Saved", translations: [{ locale: "en", title: "Saved EN" }], blocks: [] }, before = structuredClone(row);
  const draft = preparePreviewDraft("super-categories", row, "en", { title: "Draft EN" }, { heroImage: "/draft.jpg" });
  const result = preview.applyPublicPreview(row, draft);
  assert.equal(result.translations[0].title, "Draft EN"); assert.equal(result.title, "Saved"); assert.deepEqual(row, before);
  assert.throws(() => preparePreviewDraft("super-categories", row, "ar", { password: "forbidden" }, {}));
  assert.throws(() => preparePreviewDraft("super-categories", row, "ar", { title: "Draft" }, { heroImage: "javascript:alert(1)" }));
});

test("new programme blocks retain their draft text without requiring a saved child",async()=>{
  const h=majorProject();
  const draft=preparePreviewDraft("super-categories",h.row,"en",{title:"Draft"},{blocks:[{id:"draft-new",kind:"TEXT",isActive:true,title:"New section",eyebrow:"Draft eyebrow",subtitle:"Draft subtitle",body:"Draft section body",linkLabel:"Read more",linkUrl:"/en/projects"}]});
  const result=await h.service.getSuperCategory("restoration","en",draft);
  assert.equal(result.blocks[0].title,"New section");assert.equal(h.row.blocks.length,0);
});
for(const [kind,group,textKey] of [["super-categories","blocks","title"],["categories","values","label"],["categories","infoCards","body"]] as const)test(`removed ${group} text does not invalidate the remaining preview`,()=>{
  const child={id:"b".repeat(24),kind:"TEXT",isActive:true,title:"Saved section",body:"Saved body",label:"Saved value"};
  const row={title:"Saved",name:"Saved",translations:[],[group]:[child]};
  const draft=preparePreviewDraft(kind,row,"ar",{[kind==="categories"?"name":"title"]:"Draft",[`${group}.${child.id}.${textKey}`]:"Old snapshot"},{[group]:[]});
  assert.deepEqual(draft.settings[group],[]);assert.equal(Object.keys(draft.changes).some(key=>key.startsWith(group+".")),false);
  assert.throws(()=>preparePreviewDraft(kind,row,"ar",{[`${group}.foreign.password`]:"Forbidden"},{[group]:[]}));
});

function majorProject(blocks: Record<string, unknown>[] = []) {
  const queries: unknown[] = [];
  const row = { id: "a".repeat(24), slug: "restoration", title: "Saved", intro: "", subtitle: "", heroVideoLocales: [], translations: [], items: [{ kind: "CAMPAIGN", refId: "first" }, { kind: "CAMPAIGN", refId: "archived" }, { kind: "CAMPAIGN", refId: "second" }], blocks };
  const service = load<{ getSuperCategory: (slug: string, locale: string, draft?: preview.PublicPreviewDraft) => Promise<{ title: string; blocks: Array<{ campaigns: { id: string }[]; title: string }> }> }>("lib/minbar/super-category.ts", {
    "@/lib/content-editor/public-preview": preview,
    "@/lib/slug": { whereByIdOrAnyLocaleSlug: (slug: string) => ({ slug }), pickLocaleSlug: () => row.slug },
    "next/cache": { unstable_cache: (fn: unknown) => fn }, "@/lib/prisma": { prisma: { superCategory: { findFirst: async (query: unknown) => { queries.push(query); return row; } }, superCategoryBlockTranslation: { findMany: async () => [] } } },
    "@/lib/i18n/translation-fallback": translation, "./projects": { listProjects: async () => [{ id: "second" }, { id: "first" }] }, "./posts": {}, "./routes": {}, "./cms": {}, "@/lib/content/super-category-write": { BLOCK_SOURCE_KIND },
  });
  return { row, queries, service };
}
test("adding, editing and removing a temporary card preserves the main draft without stale child fields",()=>{
  const values={name:"Unsaved category","infoCards.new-card.title":"Temporary title","infoCards.kept.title":"Kept card"};
  const source={...values};const result=preview.previewDraftValues("categories",values,{infoCards:[{id:"kept"}]});
  assert.deepEqual(result,{name:"Unsaved category","infoCards.kept.title":"Kept card"});assert.deepEqual(values,source);
});
test("a new category card previews its unsaved localized text",()=>{
  const row={name:"Saved",translations:[],values:[],infoCards:[]};
  const draft=preparePreviewDraft("categories",row,"en",{name:"Draft category"},{infoCards:[{draftKey:"new-card",icon:"alert",title:"",body:"",translations:{en:{title:"English draft",body:"English body"}}}]});
  const cards=draft.settings.infoCards as Record<string,unknown>[];
  assert.equal(cards[0].title,"English draft");assert.equal(cards[0].body,"English body");assert.deepEqual(row.infoCards,[]);
});
test("linked projects appear without requiring a separately configured grid and preserve editorial order", async () => {
  const h = majorProject(), page = await h.service.getSuperCategory("restoration", "ar");
  assert.deepEqual(Array.from(page.blocks[0].campaigns, item => item.id), ["first", "second"]);
  assert.match(JSON.stringify(h.queries[0]), /"isActive":true/);
});
test("an intentionally hidden project grid stays hidden and a configured grid is never duplicated", async () => {
  const hidden = await majorProject([{ id: "b".repeat(24), kind: "CAMPAIGNS", isActive: false }]).service.getSuperCategory("restoration", "ar");
  assert.equal(hidden.blocks.length, 0);
  const h = majorProject([{ id: "b".repeat(24), kind: "CAMPAIGNS", title: "Grid", isActive: true }]);
  assert.equal((await h.service.getSuperCategory("restoration", "ar")).blocks.length, 1);
  const draft = preparePreviewDraft("super-categories", h.row, "ar", { title: "Draft", ["blocks." + "b".repeat(24) + ".title"]: "Draft Grid" }, {});
  const page = await h.service.getSuperCategory("restoration", "ar", draft);
  assert.equal(page.title, "Draft"); assert.equal(page.blocks[0].title, "Draft Grid"); assert.equal(h.row.title, "Saved");
});
test("reserved restoration URL delegates content, metadata and tracking parameters to the CMS route", async () => {
  const calls: unknown[] = [];
  const delegate = async (props: { params: Promise<unknown>; searchParams: Promise<unknown> }) => { calls.push({ params: await props.params, searchParams: await props.searchParams }); return "CMS"; };
  const route = load<{ default: typeof delegate; generateMetadata: typeof delegate }>("app/[locale]/bagislar/al-quds-home-restoration/page.tsx", { "../[slug]/page": { __esModule:true, default: delegate, generateMetadata: delegate } });
  assert.equal(await route.default({ params: Promise.resolve({ locale: "ar" }), searchParams: Promise.resolve({ utm_campaign: "winter" }) }), "CMS");
  await route.generateMetadata({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({}) });
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), { params: { locale: "ar", slug: "al-quds-home-restoration" }, searchParams: { utm_campaign: "winter" } });
});
test("private preview authorizes before reading or parsing drafts and returns no raw database record", async () => {
  let denied = true, reads = 0, bodies = 0;
  const route = load<{ POST: (request: unknown, context: unknown) => Promise<{ status: number; body: Record<string, unknown> }> }>("app/api/admin/content-editor/[kind]/[id]/preview/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, options?: { status?: number }) => ({ body, status: options?.status ?? 200 }) } },
    "next-auth": { getServerSession: async () => ({ user: {} }) }, "@/app/api/auth/[...nextauth]/options": {}, "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: () => denied ? { status: 403 } : null },
    "@/lib/content-editor/contracts": contracts, "@/lib/content-editor/service": { readContent: async () => { reads++; return { title: "Saved", blocks: [], translations: [], internal: "private-data" }; } },
    "@/lib/content-editor/create": {}, "@/lib/content-editor/store": {}, "@/lib/content-editor/preview-draft": { preparePreviewDraft }, "@/lib/locales": locales,
    "@/lib/minbar/project-page-content": {}, "@/lib/minbar/projects": {}, "@/lib/minbar/super-category": { getSuperCategory: async (_id: string, _locale: string, draft: preview.PublicPreviewDraft) => ({ title: draft.changes.title, blocks: [] }) }, "@/lib/minbar/category-page": {}, "@/lib/minbar/posts": {},
    "@/i18n/locale-messages": { pickNamespaces: () => ({}), SHELL_NAMESPACES: [] }, "@/lib/prisma": {},
  });
  const request = { text: async () => { bodies++; return JSON.stringify({ locale: "ar", changes: { title: "Draft" }, settings: {} }); } }, context = { params: Promise.resolve({ kind: "super-categories", id: "a".repeat(24) }) };
  assert.equal((await route.POST(request, context)).status, 403); assert.equal(reads + bodies, 0);
  denied = false; const result = await route.POST(request, context); assert.equal(result.status, 200); assert.equal((result.body.page as {title: string}).title, "Draft"); assert.doesNotMatch(JSON.stringify(result.body), /private-data|internal/);
});
test("registered account total ignores donor search filters and is inaccessible without donor permission", async () => {
  const queries: unknown[] = []; let permitted = true;
  const route = load<{ GET: (request: {url: string}) => Promise<{status:number;body:{registeredDonorsTotal:number}}> }>("app/api/users/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, options?: {status?:number}) => ({body,status:options?.status ?? 200}) } },
    "@/lib/prisma": {prisma:{user:{count:async (query:unknown)=>{queries.push(query);return queries.length===1?0:42;},findMany:async()=>[]},badge:{findMany:async()=>[]}}},
    "next-auth": {getServerSession:async()=>({user:{role:"STAFF"}})}, "../auth/[...nextauth]/options": {}, "@/lib/badge-criteria": {}, "@/lib/dashboard/api-auth": {},
    "@/lib/dashboard/permissions": {sessionHasDashboardPermission:()=>permitted}, "@/lib/audit-log": {}, "@/lib/dashboard/donation-usd-revenue": {}, "@/lib/dashboard/user-demographics":demographics, "@/lib/dashboard/donor-account":account,
  });
  const request={url:"https://fixture.test/api/users?scope=donors&search=filtered&accountStatus=GUEST"};
  assert.equal((await route.GET(request)).body.registeredDonorsTotal,42);assert.match(JSON.stringify(queries[0]),/filtered/);assert.doesNotMatch(JSON.stringify(queries[1]),/filtered|GUEST|verifiedAt/);assert.match(JSON.stringify(queries[1]),/registeredAt|accounts/);
  const summary={url:"https://fixture.test/api/users?scope=donors&summary=registered&search=ignored&accountStatus=GUEST"};
  assert.equal((await route.GET(summary)).body.registeredDonorsTotal,42);assert.equal(queries.length,3);assert.doesNotMatch(JSON.stringify(queries[2]),/ignored|GUEST/);
  permitted=false;assert.equal((await route.GET(request)).status,403);assert.equal((await route.GET(summary)).status,403);assert.equal(queries.length,3);
});
