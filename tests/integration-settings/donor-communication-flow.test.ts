import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { smartWhatsappTemplateChoices } from "../../lib/communication/smart-whatsapp-templates";
import * as history from "../../lib/communication/donor-history";

type SmartService = {sendSmartWhatsapp: (input: unknown) => Promise<{ok: boolean; reason?: string}>; getSmartWhatsappContext: (id: string) => Promise<{utilityTemplates: {id: string}[]}>};
type HistoryRoute = {GET: (...args: unknown[]) => Promise<{status: number; data: {items: {source: string}[]}}>};
function load<T extends object = SmartService>(path: string, dependencies: Record<string, unknown>, append = "") {
  const loaded = {exports: {} as T};
  const code = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(code + append).runInNewContext({ module: loaded, exports: loaded.exports, Date, Buffer, Set, Map, URLSearchParams, console, process: {env: {DATABASE_URL: "fixture"}},
    require: (name: string) => dependencies[name] ?? {}, fetch: () => { throw new Error("Unexpected external send"); } });
  return loaded.exports;
}

for (const stopped of [false, true]) {
  test(`a selected Utility template is sendable without free text when Direct Send is enabled; stopped=${stopped}`, async () => {
    const calls: unknown[] = [];
    const ctx = { userId: "donor", phone: "+905555555555", locale: "ar", country: "TR", doNotContact: stopped, whatsappUnsubscribed: false, consentCheckUnavailable: false, directSendEnabled: true };
    const service = load("lib/communication/smart-whatsapp-service.ts", {
      "@/lib/prisma": {prisma: {donorCommunicationProfile: {upsert: async () => ({})}}},
      "./sender-resolution": { loadSenderRoutingSnapshot: async () => ({}), resolveSenderFromSnapshot: () => ({ ok: true, sender: {phoneNumberId: "business"} }) },
      "@/lib/locales": {isValidLocale: () => true},
      "./delivery-log-service": { createDeliveryRecord: () => { throw new Error("Must not send arbitrary direct text"); } },
      "fixture": { ctx, send: async (args: unknown) => { calls.push(args); return {ok: true, transport: "UTILITY_TEMPLATE_FALLBACK"}; } },
    }, '\ngetSmartWhatsappContext = async () => require("fixture").ctx; sendApprovedTemplateForDonor = require("fixture").send;');
    const result = await service.sendSmartWhatsapp({ userId: "donor", mode: "UTILITY", templateId: "approved", body: "" });
    assert.equal(result.ok, !stopped); assert.equal(calls.length, stopped ? 0 : 1);
    if (!stopped) assert.equal((calls[0] as {templateId: string}).templateId, "approved");
    else assert.equal(result.reason, "DO_NOT_CONTACT");
  });
}

function historyRoute(authorized = true) {
  const donorId = "507f1f77bcf86cd799439011";
  const messageId = "507f1f77bcf86cd799439012";
  type Query = {where: Record<string, unknown>};
  const queries: Query[] = [];
  const createdAt = new Date("2026-10-25T01:00:00Z");
  const select = { id: messageId, channel: "SMS", status: "DELIVERED", templateName: "Receipt", createdAt, providerMessageId: "same-provider-message" };
  const prisma = {
    user: { findUnique: async () => ({ id: donorId, name: "Fixture" }) },
    communicationDelivery: {
      findMany: async (query: Query) => { queries.push(query); return query.where.providerMessageId ? [{channel: "SMS", providerMessageId: "same-provider-message"}] : [select]; },
      findFirst: async (query: Query) => { queries.push(query); return null; },
    },
    sentMessage: { findMany: async (query: Query) => { queries.push(query); return [select]; }, findFirst: async (query: Query) => { queries.push(query); return null; } },
  };
  const route = load<HistoryRoute>("app/api/dashboard/donors/[id]/communication/route.ts", {
    "next/server": {NextResponse: {json: (data: unknown, init?: {status?: number}) => ({data, status: init?.status ?? 200})}},
    "next-auth": {getServerSession: async () => null}, "@/lib/dashboard/api-auth": {requireAdminOrDashboardPermission: () => authorized ? null : {status: 403}},
    "@/lib/prisma": {prisma}, "@/lib/communication/donor-history": history,
  });
  return { queries, get: (search = "") => route.GET({nextUrl: {searchParams: new URLSearchParams(search)}}, {params: Promise.resolve({id: donorId})}) };
}

test("unified history includes SMS and deduplicates a legacy mirror", async () => {
  const h = historyRoute(); const response = await h.get("channel=SMS");
  assert.equal(response.status, 200); assert.equal(response.data.items.length, 1); assert.equal(response.data.items[0].source, "delivery");
  assert.ok(h.queries.every((query) => query.where.recipientUserId === "507f1f77bcf86cd799439011"));
  assert.equal(h.queries[1].where.channel, "SMS");
});

test("history detail refuses a message outside the donor scope and access is checked before reads", async () => {
  const h = historyRoute(); assert.equal((await h.get("messageId=507f1f77bcf86cd799439012&source=delivery")).status, 404);
  assert.equal(h.queries[0].where.recipientUserId, "507f1f77bcf86cd799439011");
  const forbidden = historyRoute(false); assert.equal((await forbidden.get()).status, 403); assert.equal(forbidden.queries.length, 0);
});


test("donor template choices use the routed WABA and Meta approval for the donor language", async () => {
  const variant = {businessAccountId: "waba-a", languageCode: "ar", locale: "ar", approvalStatus: "APPROVED", category: "UTILITY", providerTemplateName: "receipt", componentsSchema: [], rejectionReason: null, lastSyncedAt: new Date()};
  const templates = [{id: "eligible", name: "Receipt", kind: "SYSTEM", category: "UTILITY", wabaVariants: [variant]}, {id: "other-account", name: "Other", kind: "SYSTEM", category: "UTILITY", wabaVariants: [{...variant, businessAccountId: "waba-b"}]}];
  const service = load("lib/communication/smart-whatsapp-service.ts", {
    "@/lib/prisma": {prisma: {whatsappTemplate: {findMany: async () => templates}}},
    "./sender-resolution": {loadSenderRoutingSnapshot: async () => ({}), resolveSenderFromSnapshot: () => ({ok: true, sender: {businessAccountId: "waba-a"}})},
    "./template-event-classification": {classifyEventTemplates: async (_channel: string, rows: unknown[]) => rows},
    "./smart-whatsapp-templates": {smartWhatsappTemplateChoices},
    "fixture": {donor: {phone: null, name: "Fixture", locale: "tr", country: "TR", doNotContact: false, whatsappUnsubscribed: false, consentCheckUnavailable: false}},
  }, '\ndonor = async () => require("fixture").donor; latestInboundThread = async () => null;');
  const context = await service.getSmartWhatsappContext("donor");
  assert.equal(context.utilityTemplates.length, 1); assert.equal(context.utilityTemplates[0].id, "eligible");
});
