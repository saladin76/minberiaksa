import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createHash } from "node:crypto";

const path = "app/api/admin/seo/projects/[id]/route.ts";

type Row = Record<string, unknown>;
function fixture({ denied = false, missingTranslation = false } = {}) {
  let writes = 0;
  const translations: Row[] = missingTranslation ? [] : [{
    id: "trans-en", locale: "en", title: "English project", description: "English description",
    seoTitle: "Old English title", seoDescription: "Old English description",
  }];
  const campaign: Row = {
    id: "campaign-1", slug: "campaign", title: "مشروع عربي",
    description: "وصف عربي", images: ["/default.jpg"],
    seoTitle: "عنوان عربي",
    seoDescription: "وصف عربي محفوظ",
  };
  const prisma = {
    campaign: {
      findFirst: async (args: { select: { translations: { where: { locale: string } } } }) => ({
        ...campaign,
        translations: translations.filter((item) => item.locale === args.select.translations.where.locale),
      }),
      update: async ({ data }: { data: Row }) => { writes++; Object.assign(campaign, data); },
    },
    campaignTranslation: {
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        writes++;
        const row = translations.find((item) => item.id === where.id);
        if (!row) throw new Error("Translation missing");
        Object.assign(row, data);
      },
    },
    $transaction: async (callback: (db: unknown) => Promise<unknown>) => callback(prisma),
  };
  const quality = (() => {
    const loaded = { exports: {} as Row };
    const source = fs.readFileSync("app/api/admin/seo/seo-dashboard-quality.ts", "utf8");
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new vm.Script(js).runInNewContext({ module: loaded, exports: loaded.exports, require: () => { throw Error("Unexpected import"); } });
    return loaded.exports;
  })();
  const deps: Record<string, unknown> = {
    "node:crypto": { createHash },
    "next/server": { NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status || 200 }) } },
    "next/cache": { revalidatePath: () => {} },
    "next-auth": { getServerSession: async () => ({ user: { id: "admin", role: "ADMIN" } }) },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: () => denied ? { body: { error: "Forbidden" }, status: 403 } : null },
    "@/lib/audit-log": { queueAuditLog: () => {}, auditActorFromDashboardSession: () => ({ actorRole: "ADMIN" }) },
    "@/lib/locales": { isValidLocale: (v: string) => ["ar", "en", "ja", "ur"].includes(v) },
    "@/lib/prisma": { prisma },
    "@/lib/slug": { whereByIdOrAnyLocaleSlug: () => ({}) },
    "@/lib/campaign/soft-delete-filter": { NOT_SOFT_DELETED: {} },
    "@/lib/campaign/seo-fields": { parseCampaignFaqContent: (v: string) => {
      if (!v) return null;
      const decoded = JSON.parse(v);
      if (!Array.isArray(decoded)) throw Error("Invalid FAQ");
      return JSON.stringify(decoded.filter((x: { q: string; a: string }) => x.q && x.a));
    } },
    "../../seo-dashboard-quality": quality,
  };
  const loaded = { exports: {} as Record<string, (...args: unknown[]) => Promise<{ body: any; status: number }>> };
  const js = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(js).runInNewContext({
    exports: loaded.exports, module: loaded, URL, console: { error() {} },
    require: (name: string) => { if (!(name in deps)) throw Error("Unexpected import " + name); return deps[name]; },
  });
  const context = { params: Promise.resolve({ id: "campaign-1" }) };
  const get = (locale: string) => loaded.exports.GET({ url: "https://localhost/api/admin/seo/projects/campaign-1?locale=" + locale }, context);
  const put = (body: unknown) => loaded.exports.PUT({ json: async () => body }, context);
  return { get, put, campaign, translations, writes: () => writes };
}
function preparedSeo(revision: string) {
  return {
    locale: "en", revision,
    fields: {
      seoTitle: "Humanitarian project helping families", seoDescription: "Learn about local humanitarian initiatives and support families through well-documented projects in this area.",
      seoKeyword: "", ogTitle: "", ogDescription: "", ogImage: "/og.jpg",
      imageAlt: "Community support project image", seoNoIndex: "false", faqContent: "",
    },
  };
}

test("SEO project adapter rejects unauthorized requests without accessing data", async () => {
  const f = fixture({ denied: true });
  assert.equal((await f.get("en")).status, 403);
  assert.equal((await f.put(preparedSeo("0".repeat(64)))).status, 403);
  assert.equal(f.writes(), 0);
});

test("SEO project adapter exposes locale-specific values and a revision", async () => {
  const f = fixture();
  const read = await f.get("en");
  assert.equal(read.status, 200);
  assert.equal(read.body.localeSeo.seoTitle, "Old English title");
  assert.equal(read.body.defaultSeo.seoTitle, "عنوان عربي");
  assert.equal(read.body.hasTranslation, true);
  assert.match(read.body.revision, /^[a-f0-9]{64}$/);
  assert.equal(f.writes(), 0);
});

test("SEO project adapter refuses unsupported locale and a non-existent translation", async () => {
  const f = fixture({ missingTranslation: true });
  assert.equal((await f.get("invalid")).status, 400);
  const en = await f.get("en");
  assert.equal(en.body.hasTranslation, false);
  assert.equal(en.body.localeSeo.seoTitle, "");
  assert.equal(en.body.revision, null);
  const attempted = await f.put(preparedSeo("0".repeat(64)));
  assert.equal(attempted.status, 409);
  assert.equal(f.writes(), 0);
});

test("SEO project adapter writes only the target translation's SEO fields", async () => {
  const f = fixture();
  const read = await f.get("en");
  const before = JSON.stringify(f.campaign);
  const payload = preparedSeo(read.body.revision);
  const saved = await f.put(payload);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.localeSeo.seoTitle, payload.fields.seoTitle);
  assert.equal(f.translations[0].title, "English project");
  assert.equal(JSON.stringify(f.campaign), before);
  assert.equal(f.writes(), 1);
  assert.equal((await f.put(payload)).status, 409);
  assert.equal(f.writes(), 1);
});

test("SEO project adapter refuses invalid image protocols, unsupported fields and malformed FAQ", async () => {
  const f = fixture();
  const read = await f.get("en");
  const input = preparedSeo(read.body.revision);
  input.fields.ogImage = "javascript:alert(1)";
  assert.equal((await f.put(input)).status, 422);
  input.fields.ogImage = "/og.jpg";
  input.fields.faqContent = "{";
  assert.equal((await f.put(input)).status, 400);
  assert.equal((await f.put({ ...input, fields: { ...input.fields, amount: 500 } })).status, 400);
  assert.equal(f.writes(), 0);
});

test("SEO project adapter keeps Arabic SEO isolated from foreign records", async () => {
  const f = fixture();
  const current = await f.get("ar");
  const fields = preparedSeo(current.body.revision).fields;
  const saved = await f.put({ locale: "ar", revision: current.body.revision, fields });
  assert.equal(saved.status, 200);
  assert.equal(f.campaign.seoTitle, fields.seoTitle);
  assert.equal(f.translations[0].seoTitle, "Old English title");
});
