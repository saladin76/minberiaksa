import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as donationScan from "../../lib/communication/campaign-donation-scan";
import {
  buildUniqueCampaignUtmAliases,
  campaignUtmLinksFromWhatsAppTemplates,
  campaignsNeedingTrackedTemplate,
  isCommunicationUtmMedium,
  resolveCommunicationCampaignId,
  type CampaignUtmLink,
} from "../../lib/communication/campaign-attribution-matching";

const campaignA = "6ada609ef5c859cf26ebba81";
const campaignB = "6ada609ef5c859cf26ebba82";

function link(campaignId: string, source = "whatsapp"): CampaignUtmLink {
  return {
    campaignId,
    source,
    medium: "communication",
    url: `https://minberiaksa.org/ar/bagislar?utm_source=${source}&utm_medium=communication&utm_campaign=whatsapp-campaign`,
  };
}

test("a generic UTM maps to its registered campaign when the mapping is unique", () => {
  const aliases = buildUniqueCampaignUtmAliases([link(campaignA)]);
  assert.equal(resolveCommunicationCampaignId({
    utm_source: "whatsapp",
    utm_medium: "communication",
    utm_campaign: "whatsapp-campaign",
  }, new Set([campaignA]), aliases), campaignA);
});

test("a reused generic UTM is not attributed to either campaign", () => {
  const aliases = buildUniqueCampaignUtmAliases([link(campaignA), link(campaignB)]);
  const ids = new Set([campaignA, campaignB]);
  const attribution = { utm_source: "whatsapp", utm_medium: "communication", utm_campaign: "whatsapp-campaign" };
  assert.equal(resolveCommunicationCampaignId(attribution, ids, aliases), null);
});

test("source-specific matching works, while a source-free shared UTM stays ambiguous", () => {
  const aliases = buildUniqueCampaignUtmAliases([link(campaignA, "whatsapp"), link(campaignB, "email")]);
  const ids = new Set([campaignA, campaignB]);
  assert.equal(resolveCommunicationCampaignId({
    utm_source: "whatsapp", utm_medium: "communication", utm_campaign: "whatsapp-campaign",
  }, ids, aliases), campaignA);
  assert.equal(resolveCommunicationCampaignId({
    utm_medium: "communication", utm_campaign: "whatsapp-campaign",
  }, ids, aliases), null);
});

test("exact campaign IDs and new utm_id values take priority over aliases", () => {
  const aliases = buildUniqueCampaignUtmAliases([link(campaignA), link(campaignB)]);
  const ids = new Set([campaignA, campaignB]);
  assert.equal(resolveCommunicationCampaignId({ utm_medium: "communication", utm_campaign: campaignA }, ids, aliases), campaignA);
  assert.equal(resolveCommunicationCampaignId({ utm_medium: "communication", utm_campaign: "generic", utm_id: campaignB }, ids, aliases), campaignB);
});

test("non-communication UTMs never resolve to communication campaigns", () => {
  const aliases = buildUniqueCampaignUtmAliases([link(campaignA)]);
  assert.equal(resolveCommunicationCampaignId({
    utm_source: "whatsapp", utm_medium: "social", utm_campaign: "whatsapp-campaign",
  }, new Set([campaignA]), aliases), null);
});

test("explicit IDs outside the viewed campaigns and contradictory IDs never fall back to a generic alias", () => {
  const aliases = buildUniqueCampaignUtmAliases([link(campaignA)]);
  assert.equal(resolveCommunicationCampaignId({ utm_medium: "communication", utm_source: "whatsapp", utm_campaign: "whatsapp-campaign", utm_id: campaignB }, new Set([campaignA]), aliases), null);
  assert.equal(resolveCommunicationCampaignId({ utm_medium: "communication", utm_campaign: campaignA, utm_id: campaignB }, new Set([campaignA, campaignB]), aliases), null);
});

test("legacy channel-named WhatsApp media is recognized only through its registered link", () => {
  const aliases = buildUniqueCampaignUtmAliases([{
    campaignId: campaignA,
    source: "whatsapp",
    medium: "communication",
    url: "https://minberiaksa.org/ar/bagislar?utm_source=whatsapp&utm_medium=whatsapp&utm_campaign=whatsapp-campaign",
  }]);
  assert.equal(resolveCommunicationCampaignId({
    utm_source: "whatsapp", utm_medium: "whatsapp", utm_campaign: "whatsapp-campaign",
  }, new Set([campaignA]), aliases), campaignA);
});

test("approved WhatsApp template links map to campaigns and shared aliases remain ambiguous", () => {
  const links = campaignUtmLinksFromWhatsAppTemplates([
    { campaignId: campaignA, channel: "WHATSAPP", templateId: "template-1" },
    { campaignId: campaignB, channel: "WHATSAPP", templateId: "template-1" },
  ], [{
    templateId: "template-1",
    componentsSchema: [{ type: "BUTTONS", buttons: [{
      type: "URL",
      url: "https://minberiaksa.org/ar/bagislar?utm_source=whatsapp&utm_medium=communication&utm_campaign=whatsapp-campaign",
    }] }],
  }]);
  const aliases = buildUniqueCampaignUtmAliases(links);
  assert.equal(resolveCommunicationCampaignId({
    utm_source: "whatsapp", utm_medium: "communication", utm_campaign: "whatsapp-campaign",
  }, new Set([campaignA, campaignB]), aliases), null);
});

test("campaign reporting credits a paid donation through its unique registered legacy UTM", async () => {
  const linkRows = [link(campaignA)];
  const service = isolated<{
    getCampaignOutcomeMetrics: (ids: string[]) => Promise<Map<string, { donationCount: number; revenue: number; failedDonationCount: number }>>;
  }>("lib/communication/campaign-attribution-service.ts", {
    "@/lib/prisma": { prisma: {
      donation: { findRaw: async () => [{_id:{$oid:campaignA}}], findMany: async () => [{
        id: "donation-1", status: "PAID", paidAt: new Date("2026-10-01"), currency: "USD", amount: 75, amountUSD: 75, totalAmount: 75,
        attribution: { utm_source: "whatsapp", utm_medium: "communication", utm_campaign: "whatsapp-campaign" },
      }] },
      communicationCampaignTrackingLink: { findMany: async () => linkRows },
      communicationCampaign: { findMany: async () => [] },
    } },
    "@/lib/audit-log": { writeAuditLog: async () => undefined },
    "@/lib/locales": { LOCALES: {}, isValidLocale: () => false },
    "@/lib/marketing/campaign-links/campaign-link-registry-service": { createOrUpdateCampaignLink: async () => ({}) },
    "./campaign-attribution-matching": { buildUniqueCampaignUtmAliases, campaignsNeedingTrackedTemplate, isCommunicationUtmMedium, resolveCommunicationCampaignId },
  });

  const metrics = await service.getCampaignOutcomeMetrics([campaignA]);
  const metric = metrics.get(campaignA);
  assert.equal(metric?.donationCount, 1);
  assert.equal(metric?.revenue, 75);
  assert.equal(metric?.failedDonationCount, 0);
});

test("campaign reporting can recover the UTM from the approved template when no link row was attached", async () => {
  const service = isolated<{
    getCampaignOutcomeMetrics: (ids: string[]) => Promise<Map<string, { donationCount: number; revenue: number; failedDonationCount: number }>>;
  }>("lib/communication/campaign-attribution-service.ts", {
    "@/lib/prisma": { prisma: {
      donation: { findRaw: async () => [{_id:{$oid:campaignA}}], findMany: async () => [{
        id: "donation-2", status: "PAID", paidAt: new Date("2026-10-01"), currency: "USD", amount: 125, amountUSD: 125, totalAmount: 125,
        attribution: { utm_source: "whatsapp", utm_medium: "communication", utm_campaign: "whatsapp-campaign" },
      }] },
      communicationCampaignTrackingLink: { findMany: async () => [] },
      communicationCampaign: { findMany: async () => [{ id: campaignA, channel: "WHATSAPP", templateGroupId: "template-1" }] },
      whatsappTemplateWabaVariant: { findMany: async () => [{
        templateId: "template-1",
        componentsSchema: [{ type: "BUTTONS", buttons: [{
          type: "URL",
          url: "https://minberiaksa.org/ar/bagislar?utm_source=whatsapp&utm_medium=communication&utm_campaign=whatsapp-campaign",
        }] }],
      }] },
    } },
    "@/lib/audit-log": { writeAuditLog: async () => undefined },
    "@/lib/locales": { LOCALES: {}, isValidLocale: () => false },
    "@/lib/marketing/campaign-links/campaign-link-registry-service": { createOrUpdateCampaignLink: async () => ({}) },
    "./campaign-attribution-matching": { buildUniqueCampaignUtmAliases, campaignUtmLinksFromWhatsAppTemplates, campaignsNeedingTrackedTemplate, isCommunicationUtmMedium, resolveCommunicationCampaignId },
  });

  const metric = (await service.getCampaignOutcomeMetrics([campaignA])).get(campaignA);
  assert.equal(metric?.donationCount, 1);
  assert.equal(metric?.revenue, 125);
});

test("new and attached links replace generic campaign UTMs with a campaign-specific identity", () => {
  const service = isolated<{
    buildTrackingParams: (campaign: { id: string; channel: string }) => Record<string, string | undefined>;
    decorateUrl: (url: string, params: Record<string, string | undefined>) => string;
  }>("lib/communication/campaign-attribution-service.ts", {
    "@/lib/prisma": { prisma: {} },
    "@/lib/audit-log": { writeAuditLog: async () => undefined },
    "@/lib/locales": { LOCALES: {}, isValidLocale: () => true },
    "@/lib/marketing/campaign-links/campaign-link-registry-service": { createOrUpdateCampaignLink: async () => ({}) },
    "./campaign-attribution-matching": { buildUniqueCampaignUtmAliases, campaignsNeedingTrackedTemplate, isCommunicationUtmMedium, resolveCommunicationCampaignId },
  });

  const params = service.buildTrackingParams({ id: campaignA, channel: "WHATSAPP" });
  const url = new URL(service.decorateUrl("/ar/bagislar?utm_campaign=whatsapp-campaign", params));
  assert.equal(url.searchParams.get("utm_campaign"), campaignA);
  assert.equal(url.searchParams.get("utm_id"), campaignA);
  assert.equal(url.searchParams.get("utm_source"), "whatsapp");
  assert.equal(url.searchParams.get("utm_medium"), "communication");
});

type ServiceDependencies = Record<string, unknown>;

type Outcome = { donationCount: number; revenue: number; unpricedPaidCount: number; failedDonationCount?: number };
function reportingHarness(input: { donations?: Record<string, unknown>[]; links?: CampaignUtmLink[]; fail?: boolean; paged?: boolean }) {
  let calls = 0, scans = 0;
  const service = isolated<{
    getCampaignOutcomeSummary: (ids: string[]) => Promise<{ metrics: Map<string, Outcome>; unattributed: Outcome }>;
  }>("lib/communication/campaign-attribution-service.ts", {
    "@/lib/prisma": { prisma: {
      donation: { findRaw: async () => {
        scans++;
        if (input.fail) throw new Error("database offline");
        if (input.paged && scans === 1) return Array.from({length:1000},(_,index)=>({_id:{$oid:(index+1).toString(16).padStart(24,"0")}}));
        return (input.donations ?? []).map((_,index)=>({_id:{$oid:(1001+index).toString(16).padStart(24,"0")}}));
      }, findMany: async () => {
        calls++;
        if (input.fail) throw new Error("database offline");
        if (input.paged && calls === 1) return Array.from({ length: 1000 }, (_, index) => ({ id: String(index), status: "PAID", attribution: {} }));
        return input.donations ?? [];
      } },
      communicationCampaignTrackingLink: { findMany: async () => input.links ?? [] },
      communicationCampaign: { findMany: async () => [] },
    } },
    "@/lib/audit-log": { writeAuditLog: async () => undefined },
    "@/lib/locales": { LOCALES: {}, isValidLocale: () => true },
    "@/lib/marketing/campaign-links/campaign-link-registry-service": {},
    "./campaign-attribution-matching": { buildUniqueCampaignUtmAliases, campaignUtmLinksFromWhatsAppTemplates, campaignsNeedingTrackedTemplate, isCommunicationUtmMedium, resolveCommunicationCampaignId },
  });
  return { service, calls: () => calls };
}
const confirmed = { id: "paid", status: "PAID", paidAt: new Date("2026-10-01"), amount: 10.25, amountUSD: 10.25, totalAmount: 12, currency: "USD", attribution: { utm_source: "whatsapp", utm_medium: "messaging", utm_campaign: campaignA } };

test("campaign income requires settlement, preserves cents, and never labels unconverted TRY as USD", async () => {
  const { service } = reportingHarness({ donations: [
    confirmed,
    { ...confirmed, id: "pending", paidAt: null, amountUSD: 999 },
    { ...confirmed, id: "unpriced", currency: "TRY", amountUSD: null, amount: 3000 },
    { ...confirmed, id: "zero-placeholder", currency: "TRY", amountUSD: 0, amount: 1000 },
    { ...confirmed, id: "usd-fallback", amountUSD: null, amount: 5.12, totalAmount: 6 },
    { ...confirmed, id: "failed", status: "FAILED", paidAt: null },
  ] });
  const metric = (await service.getCampaignOutcomeSummary([campaignA])).metrics.get(campaignA)!;
  assert.equal(metric.donationCount, 4);
  assert.equal(metric.revenue, 15.37);
  assert.equal(metric.unpricedPaidCount, 2);
  assert.equal(metric.failedDonationCount, 1);
});

test("actual shared messaging UTMs remain visible as unassigned income without double credit", async () => {
  const links = [campaignA, campaignB].map(campaignId => ({ ...link(campaignId), url: link(campaignId).url.replace("medium=communication", "medium=messaging") }));
  const { service } = reportingHarness({ donations: [{ ...confirmed, attribution: { ...confirmed.attribution, utm_campaign: "whatsapp-campaign" } }], links });
  const result = await service.getCampaignOutcomeSummary([campaignA, campaignB]);
  assert.equal(result.metrics.size, 0);
  assert.equal(result.unattributed.donationCount, 1);
  assert.equal(result.unattributed.revenue, 10.25);
});

test("campaign income survives the donation display cap and database failure never becomes zero", async () => {
  const { service, calls } = reportingHarness({ donations: [confirmed], paged: true });
  assert.equal((await service.getCampaignOutcomeSummary([campaignA])).metrics.get(campaignA)?.revenue, 10.25);
  assert.equal(calls(), 2);
  await assert.rejects(reportingHarness({ fail: true }).service.getCampaignOutcomeSummary([campaignA]), /database offline/);
});

test("a reply without click evidence never increments campaign click totals", () => {
  const counters = isolated<{ tallyDeliveryStatuses: (statuses: string[]) => { clicked: number; replied: number }; tallyDeliveryRows: (rows: Record<string, unknown>[]) => { clicked: number; replied: number } }>("lib/communication/campaign-counter-service.ts", { "@/lib/prisma": { prisma: {} } });
  const row = { status: "REPLIED", deliveredAt: null, readAt: null, openedAt: null, clickedAt: null, repliedAt: new Date() };
  assert.equal(counters.tallyDeliveryStatuses(["REPLIED"]).clicked, 0);
  assert.equal(counters.tallyDeliveryRows([row]).clicked, 0);
  assert.equal(counters.tallyDeliveryRows([row]).replied, 1);
  assert.equal(counters.tallyDeliveryRows([{ ...row, clickedAt: new Date() }]).clicked, 1);
  const acceptedThenFailed = counters.tallyDeliveryRows([{ ...row, status: "FAILED", repliedAt: null, providerMessageId: "accepted-id", sentAt: new Date() }]) as { sent?: number; failed?: number };
  assert.equal(acceptedThenFailed.sent, 1);
  assert.equal(acceptedThenFailed.failed, 1);
});

test("Meta template performance reads real delivery evidence instead of the inactive legacy archive", async () => {
  const counters = isolated<Record<string, unknown>>("lib/communication/campaign-counter-service.ts", { "@/lib/prisma": { prisma: {} } });
  const row = { status: "FAILED", sentAt: new Date(), providerMessageId: "fixture-accepted", deliveredAt: null, readAt: null, openedAt: null, clickedAt: null, repliedAt: null };
  const route = isolated<{ GET: (request: unknown, context: { params: Promise<{ id: string }> }) => Promise<{ performance: Record<string, number> }> }>("app/api/templates/whatsapp/[id]/performance/route.ts", {
    "next/server": { NextResponse: { json: (value: unknown) => value } },
    "next-auth": { getServerSession: async () => ({}) },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: () => null },
    "@/lib/prisma": { prisma: {
      whatsappTemplate: { findUnique: async () => ({ id: "template", provider: "META_WHATSAPP", externalTemplateId: null }) },
      communicationDelivery: { findMany: async (query: { select: { status?: boolean } }) => query.select.status ? [row] : [] },
      sentMessage: { groupBy: async () => { throw new Error("Meta must not read the legacy send archive"); } },
    } },
    "@/lib/communication/campaign-counter-service": counters,
    "@/lib/communication/campaign-attribution-service": { getTemplateDonationOutcome: async () => ({ donationCount: 1, revenue: 10.25, unpricedPaidCount: 0 }) },
    "@/lib/messaging/whatsapp-template-recommendations": { computeTemplateRecommendations: () => [] },
  });
  const result = await route.GET({}, { params: Promise.resolve({ id: "template" }) });
  assert.equal(result.performance.sent, 1);
  assert.equal(result.performance.failed, 1);
  assert.equal(result.performance.delivered, 0);
  assert.equal(result.performance.clicked, 0, "a donation is not a click event");
  assert.equal(result.performance.revenueUSD, 10.25);
});

function isolated<T>(file: string, dependencies: ServiceDependencies): T {
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} as Record<string, unknown> };
  new vm.Script(output, { filename: file }).runInNewContext({
    module: loaded,
    exports: loaded.exports,
    process: { env: { DATABASE_URL: "test" } },
    URL,
    require: (id: string) => {
      if (id === "./campaign-donation-scan") return donationScan;
      if (!(id in dependencies)) throw new Error(`Unexpected dependency: ${id}`);
      return dependencies[id];
    },
  });
  return loaded.exports as T;
}
