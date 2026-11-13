import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as policy from "../../lib/marketing/tracking-link-policy";
import * as routes from "../../lib/minbar/routes";
import { pickLocaleSlug } from "../../lib/slug";

const builderPath = "app/(dashboard)/dashboard/marketing/attribution/_components/TrackingLinkBuilder.tsx";
function builderModel() {
  const source = fs.readFileSync(builderPath, "utf8").split("export default function TrackingLinkBuilder")[0] + "\nmodule.exports={makeMarketingParams,buildPath,fieldValue,identifierValue,initialMarketingForm};";
  const loaded = { exports: {} as { makeMarketingParams: (form: Record<string, unknown>, locale: string) => Record<string, string>; buildPath: (kind: string, opts: Record<string, string>) => string; fieldValue: (value: string) => string | undefined; identifierValue: (value: string) => string | undefined; initialMarketingForm: Record<string, unknown> } };
  const imports: Record<string, unknown> = { "@/lib/marketing/tracking-link-policy": policy, "@/lib/minbar/routes": routes, "@/lib/dashboard/i18n": { dt: (text: string) => text, dashDir: () => "rtl" } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { module: loaded, exports: loaded.exports, require: (name: string) => imports[name] ?? {}, URLSearchParams });
  return loaded.exports;
}

test("campaign names retain Arabic, Turkish and other supported writing systems", () => {
  assert.equal(policy.campaignSlug("إغاثة غزة · نوفمبر"), "إغاثة-غزة-نوفمبر");
  assert.equal(policy.campaignSlug("Türkiye İçin Bağış"), "türkiye-için-bağış");
  assert.equal(policy.campaignSlug("日本 支援"), "日本-支援");
});

test("ad parameters preserve real placeholder syntax and escape separators safely", () => {
  const result = policy.serializeAdParameters({ campaign_id: "{{campaign.id}}", utm_content: "A&B", utm_campaign: "Gaza support" });
  assert.match(result, /campaign_id=\{\{campaign.id\}\}/);
  assert.equal(new URLSearchParams(result).get("utm_content"), "A&B");
  assert.equal(new URLSearchParams(result).get("utm_campaign"), "Gaza support");
  assert.doesNotMatch(result, /%7B/i);
});

test("observed invalid macros are blocked even when URL encoded twice", () => {
  for (const value of ["{{device_platform}}", "{{publisher_platform}}", encodeURIComponent("{{device_platform}}"), encodeURIComponent(encodeURIComponent("{{publisher_platform}}"))]) {
    assert.equal(policy.blockedTrackingMacros(value).length, 1);
  }
  assert.deepEqual(policy.blockedTrackingMacros("{{campaign.id}}&placement={{placement}}"), []);
});

test("saved ad templates split into website URL and parameters while preserving project, currency and referral", () => {
  const result = policy.splitTrackingUrl("https://minberiaksa.org/tr/bagislar/gaza-bread?currency=TRY&ref=team&utm_source=facebook&utm_campaign=%7B%7Bcampaign.name%7D%7D&campaign_id=%7B%7Bcampaign.id%7D%7D");
  assert.ok(result);
  assert.equal(result.destination, "https://minberiaksa.org/tr/bagislar/gaza-bread?currency=TRY&ref=team");
  assert.equal(new URLSearchParams(result.parameters).get("campaign_id"), "{{campaign.id}}");
  assert.equal(policy.hasTrackingMacros(result.parameters), true);
  assert.equal(policy.hasTrackingMacros(result.destination), false);
  for (const raw of ["javascript:alert(1)", "data:text/html,test", "https://user:secret@example.org/", "not a url"]) assert.equal(policy.splitTrackingUrl(raw), null);
});

test("actual builder generates canonical project paths and keeps automatic templates out of registry IDs", () => {
  const model = builderModel();
  assert.equal(model.buildPath("campaign", { resourceId: "gaza-bread", profileTab: "account", donationId: "" }), "/bagislar/gaza-bread");
  assert.equal(model.buildPath("campaigns", { resourceId: "", profileTab: "account", donationId: "" }), "/bagislar");
  const params = model.makeMarketingParams({ ...model.initialMarketingForm, autoPlatformData: true }, "tr");
  assert.equal(params.campaign_id, "{{campaign.id}}");
  assert.equal(model.identifierValue(params.campaign_id), undefined);
  assert.equal(params.language, "tr");
  assert.equal(model.fieldValue("Use {{campaign.id}} in Ads Manager"), "Use {{campaign.id}} in Ads Manager", "notes retain explanatory text");
  const staticParams = model.makeMarketingParams({ ...model.initialMarketingForm, campaignName: "Türkiye Bağış", autoPlatformData: false }, "tr");
  assert.equal(staticParams.utm_campaign, "türkiye-bağış");
  assert.equal(policy.hasTrackingMacros(policy.serializeAdParameters(staticParams)), false);
});


test("link builder supports large sections and all primary public page routes", () => {
  const { buildPath } = builderModel();
  const opts = { resourceId: "palestine-campaign", profileTab: "account", donationId: "" };
  assert.equal(buildPath("super_category", opts), "/bagislar/palestine-campaign");
  assert.equal(buildPath("category", opts), "/category/palestine-campaign");
  assert.equal(buildPath("campaigns_legacy", opts), "/campaigns");
  assert.equal(buildPath("bank_transfer", opts), "/bank-transfer");
  for (const [kind, route] of [
    ["zakat", "zakat"], ["zakat_calculator", "zakatCalculator"], ["waqf", "waqf"],
    ["recurring", "recurring"], ["aqsa", "aqsa"], ["jerusalem", "jerusalem"],
    ["reports", "reports"], ["news", "news"], ["programs", "programs"],
    ["achievement_videos", "achievementVideos"], ["endorsement_videos", "endorsementVideos"],
    ["publications", "publications"], ["courses", "courses"], ["volunteer", "volunteer"],
    ["partner", "partner"], ["bank_accounts", "bankAccounts"], ["cart", "cart"],
    ["terms", "terms"], ["privacy", "privacy"], ["donation_policy", "donationPolicy"],
    ["cookies", "cookies"], ["accessibility", "accessibility"],
  ] as const) {
    assert.equal(buildPath(kind, opts), "/" + routes.SLUGS[route], kind);
  }
});

test("link-generator endpoint includes only active major sections with locale slugs", async () => {
  const source = fs.readFileSync("app/api/admin/link-generator/data/route.ts", "utf8");
  const mockRows = [{ id: "major123", slug: "alkuds", title: "القدس", translations: [
    { locale: "tr", title: "Kudüs", slug: "kudus" },
    { locale: "en", title: "Jerusalem", slug: "jerusalem" },
  ] }];
  let whereSeen: unknown = null;
  const prisma = {
    campaign: { findMany: async () => [] },
    category: { findMany: async () => [] },
    superCategory: { findMany: async (args: { where: unknown }) => { whereSeen = args.where; return mockRows; } },
    post: { findMany: async () => [] },
    postCategory: { findMany: async () => [] },
  };
  const load = (authorized: boolean) => {
    const out = { exports: {} as { GET: () => Promise<{ status: number; body: Record<string, unknown> }> } };
    const imports: Record<string, unknown> = {
      "next/server": { NextResponse: { json: (body: unknown, init: ResponseInit = {}) => ({ status: init.status ?? 200, body }) } },
      "next-auth": { getServerSession: async () => ({ user: { id: "qa" } }) },
      "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
      "@/lib/prisma": { prisma },
      "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: () => authorized ? null : { status: 403, body: {} } },
      "@/i18n/routing.config": { routing: { locales: ["ar", "tr", "en"] } },
      "@/lib/currency-link": { URL_CURRENCY_CODES_ORDERED: ["DEFAULT", "USD"] },
      "@/lib/slug": { pickLocaleSlug },
    };
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText, { module: out, exports: out.exports, require: (name: string) => {
      assert.ok(name in imports, name); return imports[name];
    }, console });
    return out.exports.GET;
  };
  assert.equal((await load(false)()).status, 403);
  const response = await load(true)();
  assert.equal(response.status, 200);
  assert.equal(JSON.stringify(whereSeen), JSON.stringify({ isActive: true }));
  const superCategories = response.body.superCategories as Array<{id: string; slugByLocale: Record<string, string>; titleByLocale: Record<string, string>; supportedLocales: string[]}>;
  assert.equal(superCategories.length, 1);
  assert.equal(superCategories[0].id, "major123");
  assert.equal(superCategories[0].slugByLocale.tr, "kudus");
  assert.equal(superCategories[0].slugByLocale.en, "jerusalem");
  assert.equal(superCategories[0].slugByLocale.ar, "alkuds");
  assert.equal(superCategories[0].titleByLocale.tr, "Kudüs");
  assert.equal(superCategories[0].titleByLocale.en, "Jerusalem");
  assert.ok(superCategories[0].supportedLocales.includes("ar"));
});

function routeFixture(authorized = true) {
  const writes: unknown[] = [];
  const loaded = { exports: {} as { POST: (request: { json: () => Promise<unknown> }) => Promise<{ body: { code?: string }; status: number }> } };
  const imports: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init: ResponseInit = {}) => ({ body, status: init.status ?? 200 }) } },
    "next-auth": { getServerSession: async () => ({ user: { id: "fixture-admin" } }) }, "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: () => authorized ? null : { status: 403, body: {} } },
    "@/lib/marketing/tracking-link-policy": policy,
    "@/lib/marketing/campaign-links/campaign-link-registry-service": { readCampaignLinkPayload: (body: unknown) => body, createOrUpdateCampaignLink: async (input: unknown) => { writes.push(input); return { id: "fixture-link" }; } },
    "@/lib/prisma": { prisma: {} }, "@/lib/prisma-raw-command": { rawCommand: () => assert.fail("unexpected write") },
  };
  const source = ts.transpileModule(fs.readFileSync("app/api/admin/marketing-intelligence/campaign-links/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { module: loaded, exports: loaded.exports, require: (name: string) => { assert.ok(name in imports, name); return imports[name]; }, Headers, URLSearchParams, Date });
  return { post: loaded.exports.POST, writes };
}

test("actual save API rejects invalid macros and non-web URLs before a registry write", async () => {
  for (const url of ["https://minberiaksa.org/ar?device=%7B%7Bdevice_platform%7D%7D", "https://minberiaksa.org/ar?platform={{publisher_platform}}", "javascript:alert(1)"]) {
    const fixture = routeFixture();
    assert.equal((await fixture.post({ json: async () => ({ url, platform: "meta" }) })).status, 400);
    assert.equal(fixture.writes.length, 0);
  }
  const fixture = routeFixture();
  assert.equal((await fixture.post({ json: async () => ({ url: "https://minberiaksa.org/ar/bagislar/gaza-bread?campaign_id={{campaign.id}}", platform: "meta", campaignId: "{{campaign.id}}", adId: "{{ad.id}}" }) })).status, 200);
  assert.equal(fixture.writes.length, 1);
  assert.equal((fixture.writes[0] as Record<string, unknown>).campaignId, null);
  assert.equal((fixture.writes[0] as Record<string, unknown>).adId, null);
});

test("save API still checks dashboard permission before parsing or writing the link", async () => {
  const fixture = routeFixture(false);
  const result = await fixture.post({ json: async () => assert.fail("must not read unauthorized data") });
  assert.equal(result.status, 403);
  assert.equal(fixture.writes.length, 0);
});

test("all literal attribution UI labels are present in English and Turkish catalogs", () => {
  const paths = ["app/(dashboard)/dashboard/marketing/attribution/page.tsx", ...["TrackingLinkBuilder", "CampaignLinksPanel", "AttributionWorkspace"].map(name => `app/(dashboard)/dashboard/marketing/attribution/_components/${name}.tsx`)];
  for (const locale of ["en", "tr"]) {
    const catalog = JSON.parse(fs.readFileSync(`lib/dashboard/i18n/catalog/${locale}.json`, "utf8")) as Record<string, string>;
    for (const path of paths) for (const match of fs.readFileSync(path, "utf8").matchAll(/dt\("([^"\n]+)"/g)) assert.ok(catalog[match[1]], `${locale}: ${match[1]}`);
  }
});

test("ad destinations never expose private, checkout, or receipt routes and Snapchat has a preset", () => {
  const source = fs.readFileSync(builderPath, "utf8");
  assert.match(source, /NON_AD_DESTINATIONS = new Set<PageKind>/);
  for (const kind of ["profile", "success", "success_donation", "auth_signin", "cart"]) {
    assert.ok(source.includes('"' + kind + '"'), kind);
  }
  assert.match(source, /id: "snapchat", label: "Snapchat Ads", source: "snapchat"/);
  assert.match(source, /NON_AD_DESTINATIONS\.has\(pageKind\)/);
});

test("link generator filters unpublished and deleted projects server-side", () => {
  const source = fs.readFileSync("app/api/admin/link-generator/data/route.ts", "utf8");
  assert.match(source, /where:\s*\{\s*isActive:\s*true,\s*OR:\s*\[\s*\{\s*isDeleted:\s*false\s*\},\s*\{\s*isDeleted:\s*\{\s*isSet:\s*false\s*\}\s*\}\s*\]\s*\}/);
  assert.match(source, /prisma\.post\.findMany\(\{\s*where: \{ published: true \}/);
});
