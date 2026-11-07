import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { SUPPORTED_LOCALES } from "../../lib/locales";
import * as readiness from "../../lib/communication/whatsapp-template-readiness";
import * as media from "../../lib/communication/template-locale-media";
import { smartWhatsappTemplateChoices } from "../../lib/communication/smart-whatsapp-templates";
import { buildMetaComponents } from "../../lib/communication/providers/meta-whatsapp/parameters";
import { buildWhatsappRenderedPreview } from "../../lib/communication/whatsapp-rendered-preview";

const variant = (locale: string, status = "APPROVED", waba = "waba-a") => ({
  businessAccountId: waba, languageCode: media.META_TEMPLATE_LANGUAGES[locale] ?? locale, locale,
  approvalStatus: status, category: "MARKETING", providerTemplateName: "greeting",
  componentsSchema: [{ type: "BODY", text: "Merhaba {{1}}" }], rejectionReason: null, lastSyncedAt: new Date(),
});

for (const locale of SUPPORTED_LOCALES) {
  test(`${locale}: greeting choices require the donor language on the routed account`, () => {
    const rows = SUPPORTED_LOCALES.map((key) => variant(key));
    assert.equal(readiness.resolveExactVariantForLocale(rows, locale).languageCode, media.META_TEMPLATE_LANGUAGES[locale]);
    const template = { id: "greeting", name: "Greeting", kind: "CAMPAIGN", wabaVariants: rows };
    const wabas = { MARKETING: "waba-a", UTILITY: "waba-a" };
    assert.equal(smartWhatsappTemplateChoices([template], locale, wabas).marketingTemplates.length, 1);
    for (const status of ["PENDING", "REJECTED", "PAUSED", "DISABLED"]) {
      const unavailable = rows.map((row) => row.locale === locale ? { ...row, approvalStatus: status } : row);
      assert.equal(smartWhatsappTemplateChoices([{ ...template, wabaVariants: unavailable }], locale, wabas).marketingTemplates.length, 0);
    }
    const otherAccount = rows.map((row) => row.locale === locale ? { ...row, businessAccountId: "waba-b" } : row);
    assert.equal(smartWhatsappTemplateChoices([{ ...template, wabaVariants: otherAccount }], locale, wabas).marketingTemplates.length, 0);
  });
}

test("regional Meta codes and Norwegian aliases match, while misleading locale metadata cannot select Arabic", () => {
  assert.equal(readiness.resolveExactVariantForLocale([variant("tr")], "TR-tr").languageCode, "tr");
  assert.equal(readiness.resolveExactVariantForLocale([variant("no")], "no-NO").languageCode, "nb");
  assert.equal(readiness.resolveExactVariantForLocale([variant("pt")], "pt-PT").languageCode, "pt_BR");
  assert.equal(readiness.resolveExactVariantForLocale([{ ...variant("ar"), locale: "tr" }], "tr").ready, false);
});

function load<T>(path: string, dependencies: Record<string, unknown>, append = ""): T {
  const mod = { exports: {} as T };
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(code + append, { filename: path }).runInNewContext({
    module: mod, exports: mod.exports, Date, Map, Set, console, process: { env: { DATABASE_URL: "fixture" } },
    fetch: () => { throw new Error("Unexpected external request"); },
    require: (id: string) => dependencies[id] ?? {},
  });
  return mod.exports;
}

for (const scenario of ["approved", "missing", "pending", "other-account"] as const) {
  test(`the actual smart send and provider mapping enforce exact language before delivery: ${scenario}`, async () => {
    const rows = [variant("ar"), ...(scenario === "missing" ? [] : [variant("tr", scenario === "pending" ? "PENDING" : "APPROVED", scenario === "other-account" ? "waba-b" : "waba-a")])];
    const queriedWabas: string[] = [];
    const sync = load<{ getTemplateReadiness: (...args: unknown[]) => Promise<unknown> }>("lib/communication/whatsapp-template-sync.ts", {
      "./whatsapp-template-readiness": readiness,
      "@/lib/prisma": { prisma: { whatsappTemplateWabaVariant: { findMany: async (query: { where: { businessAccountId: string } }) => {
        queriedWabas.push(query.where.businessAccountId);
        return rows.filter((row) => row.businessAccountId === query.where.businessAccountId);
      } } } },
    });
    const automatic = load<{ resolveMetaTemplateMapping: (...args: unknown[]) => Promise<unknown> }>("lib/communication/automatic-message-dispatcher.ts", {
      "./whatsapp-template-sync": sync, "./template-locale-media": media,
    });
    const archived: Array<{ renderedBody: string; locale: string }> = [];
    const payloads: Array<{ languageCode: string }> = [];
    const contextLocales: string[] = [];
    const template = { id: "greeting", name: "Greeting", kind: "CAMPAIGN", category: "MARKETING", provider: "META_WHATSAPP", variables: [{ key: "user.name" }], status: "ACTIVE" };
    const service = load<{ send: (input: unknown) => Promise<{ ok: boolean; reason?: string }> }>("lib/communication/smart-whatsapp-service.ts", {
      "@/lib/prisma": { prisma: { whatsappTemplate: { findUnique: async () => template }, donorCommunicationProfile: { findUnique: async () => ({ doNotContact: false }) } } },
      "./template-event-classification": { classifyEventTemplates: async (_channel: string, templates: unknown[]) => templates },
      "./template-locale-media": media,
      "@/lib/templates/variables": { loadContextsForUserIds: async (_ids: string[], locale: string) => { contextLocales.push(locale); return new Map([["donor", { user: { name: "Fixture Donor" }, donations: [] }]]); } },
      // Even a stale Arabic local preview must not replace the provider's Turkish body in the archive.
      "./template-compat": { renderChannelTemplate: async () => ({ body: "مرحبا", resolvedLocale: "ar" }) },
      "./automatic-message-dispatcher": automatic,
      "./providers/meta-whatsapp/parameters": { buildMetaComponents },
      "./whatsapp-rendered-preview": { buildWhatsappRenderedPreview },
      "./delivery-log-service": { createDeliveryRecord: async (input: { renderedBody: string; locale: string }) => { archived.push(input); return { ok: true, data: { id: "delivery" } }; }, markDeliveryStatus: async () => undefined },
      "./whatsapp-marketing-frequency": { reserveWhatsappMarketingSend: async () => ({ ok: true, reservation: {} }) },
      "./campaign-audience-accounting": { isWhatsappExplicitlyUnsubscribed: () => false },
      "./runtime-config": { getActiveMetaWhatsappRuntimeConfig: async () => ({}) },
      "./providers/meta-whatsapp/messages": { sendTemplateMessage: async (input: { languageCode: string }) => { payloads.push(input); return { ok: true, providerMessageId: "fixture" }; } },
      "./donor-communication-profile-service": { touchProfileCommunication: async () => undefined }, "@/lib/audit-log": { writeAuditLog: async () => undefined },
    }, "\nexports.send = sendApprovedTemplateForDonor;");
    const result = await service.send({ templateId: "greeting", expected: "MARKETING", locale: "tr", ctx: { userId: "donor", name: "Fixture Donor", phone: "+905550000000" }, sender: { id: "sender", phoneNumberId: "number", businessAccountId: "waba-a" } });
    assert.deepEqual(queriedWabas, ["waba-a"]);
    assert.deepEqual(contextLocales, ["tr"]);
    if (scenario === "approved") {
      assert.equal(result.ok, true);
      assert.equal(payloads.length, 1);
      assert.equal(payloads[0].languageCode, "tr");
      assert.equal(archived[0].renderedBody, "Merhaba Fixture Donor");
      assert.equal(archived[0].locale, "tr");
    } else {
      assert.equal(result.ok, false);
      assert.equal(result.reason, "META_TEMPLATE_NOT_APPROVED_FOR_SENDER_LANGUAGE");
      assert.equal(archived.length, 0);
      assert.equal(payloads.length, 0);
    }
  });
}
