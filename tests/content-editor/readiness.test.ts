import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { CONFIG } from "../../lib/content-editor/contracts";
import * as readiness from "../../lib/content-editor/readiness";
import { campaignWorkspaceWhere } from "../../lib/content-editor/site-capabilities";

const id = "111111111111111111111111";
test("readiness distinguishes real translations, copied Arabic, SEO omissions and invalid legacy fields without leaking content", () => {
  const item = readiness.contentReadiness("campaigns", { id, title: "مشروع غزة", description: "نص سري", seoTitle: "عنوان بحث", seoDescription: "وصف بحث", images: ["/project.jpg"], imageAlt: "صورة", translations: [
    { locale: "en", title: "Gaza project", description: "Translated copy", seoTitle: "Gaza", seoDescription: "x".repeat(208), imageAlt: "Gaza photo" },
    { locale: "tr", title: "مشروع غزة", description: "نص سري" },
  ] });
  assert.equal(item.locales.ar.complete, true); assert.deepEqual(item.locales.en.contentMissing, []); assert.deepEqual(item.locales.en.invalid, ["seoDescription"]);
  assert.ok(item.locales.tr.contentMissing.includes("title")); assert.ok(item.locales.fr.seoMissing.includes("imageAlt"));
  assert.doesNotMatch(JSON.stringify(item), /نص سري|Translated copy|project.jpg|xxxx/);
  assert.equal(readiness.readinessEditorHref("campaigns", id, "tr", "seo"), `/dashboard/content/campaigns/${id}?locale=tr&section=seo`);
});

function route(allowed = true) {
  const queries: Record<string, unknown>[] = [], permissions: string[] = [];
  const loaded = { exports: {} as { GET: (request: { nextUrl: URL }) => Promise<Response> } };
  const source = ts.transpileModule(fs.readFileSync("app/api/admin/content-editor/readiness/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const deps: Record<string, unknown> = {
    "next/server": { NextResponse: { json: Response.json } }, "next-auth": { getServerSession: async () => ({ user: {} }) },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: (_session: unknown, permission: string) => { permissions.push(permission); return allowed ? null : Response.json({}, { status: 403 }); } },
    "@/lib/content-editor/contracts": { CONFIG }, "@/lib/content-editor/readiness": readiness,
    "@/lib/content-editor/site-capabilities": { campaignWorkspaceWhere },
    "@/lib/content-editor/store": { contentStore: { model: () => ({ findMany: async (query: Record<string, unknown>) => { queries.push(query); return Array.from({ length: 51 }, () => ({ id, title: "Project", description: "Private body", translations: [] })); } }) } },
  };
  new vm.Script(source).runInNewContext({ module: loaded, exports: loaded.exports, Date, require: (name: string) => { if (!(name in deps)) throw new Error(name); return deps[name]; } });
  return { queries, permissions, get: (query: string) => loaded.exports.GET({ nextUrl: new URL("https://example.test/?" + query) }) };
}
test("readiness enforces each section permission before querying and bounds every page", async () => {
  const denied = route(false); assert.equal((await denied.get("kind=campaigns")).status, 403); assert.equal(denied.queries.length, 0);
  for (const kind of readiness.READINESS_KINDS) {
    const h = route(), response = await h.get("kind=" + kind), body = await response.json();
    assert.deepEqual(h.permissions, [CONFIG[kind].permission]); assert.equal(h.queries[0].take, 51);
    assert.equal(body.items.length, 50); assert.equal(body.nextCursor, id); assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.doesNotMatch(JSON.stringify(body), /Private body/);
  }
});
test("readiness rejects malformed cursors, sections and searches without database access", async () => {
  for (const query of ["kind=unknown", "kind=campaigns&cursor=invalid", "kind=blog&q=" + "a".repeat(121), "kind=categories&q=%00"]) {
    const h = route(); assert.equal((await h.get(query)).status, 400); assert.equal(h.queries.length, 0);
  }
});
