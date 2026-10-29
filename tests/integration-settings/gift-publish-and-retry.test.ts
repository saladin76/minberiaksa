import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fixtureModule } from "./gift-delivery-fixture";
import { readGiftDeliveryState } from "../../lib/donations/gift-delivery-state";

function publisher(hasDefault: boolean) {
  const targets: string[] = [];
  const service = fixtureModule<{ publishWhatsappTemplateToMeta: (id: string, actor: unknown, opts: unknown) => Promise<{ ok: boolean; targets: number }> }>("lib/communication/meta-template-publisher.ts", {
    "server-only": {}, "./template-locale-media": { templateLocaleHeader: () => ({}), META_TEMPLATE_LANGUAGES: { ar: "ar", tr: "tr" } },
    "@/lib/templates/localize-donation-failure-link": { localizeDonationFailureDraft: (input: unknown) => input },
    "@/lib/prisma": { prisma: {
      whatsappTemplate: { findUnique: async () => ({ id: "gift", name: "mia_gift_donation_v1", body: "Gift", translations: { tr: { body: "Gift TR" } }, category: "UTILITY", kind: "SYSTEM" }), update: async () => ({}) },
      communicationSender: { findMany: async () => [{ businessAccountId: "default-waba", isDefault: hasDefault }, { businessAccountId: "ordinary-waba", isDefault: false }] },
      whatsappTemplateWabaVariant: { findMany: async () => [], upsert: async () => ({}) },
    } },
    "@/lib/audit-log": { writeAuditLog: async () => {} }, "./runtime-config": { getActiveMetaWhatsappRuntimeConfig: async () => ({ configured: true, values: {} }) },
    "./providers/meta-whatsapp/templates": { ensureMetaTemplate: async (input: { businessAccountId: string }) => { targets.push(input.businessAccountId); return { ok: true, id: "provider-template", status: "PENDING", existed: false }; } },
    "./providers/meta-whatsapp/errors": { META_REASONS: {} }, "./whatsapp-template-sync": { syncMetaWhatsappTemplates: async () => {} },
    "./meta-parameter-name": { schemaHasInvalidMetaParameterNames: () => false },
    "./meta-template-components": { variableOrder: () => [], sameVariables: () => true, sameVariableSet: () => true, buildStandardMetaComponents: () => ({ components: [], bindings: [] }) },
  });
  return { targets, run: () => service.publishWhatsappTemplateToMeta("gift", null, { defaultOnly: true }) };
}

test("gift template publication targets only the default WABA, leaving ordinary numbers untouched", async () => {
  const f = publisher(true); const result = await f.run();
  assert.equal(result.ok, true); assert.equal(result.targets, 2); assert.deepEqual(f.targets, ["default-waba", "default-waba"]);
});
test("gift publication without a default does not fall back to another active WABA", async () => {
  const f = publisher(false); assert.equal((await f.run()).ok, false); assert.deepEqual(f.targets, []);
});

function retry(status: "SENT" | "SENDING") {
  const calls = { central: 0, originalStamped: 0, genericSend: 0 };
  const imports = [...readFileSync("lib/communication/delivery-retry-service.ts", "utf8").matchAll(/from\s+["']([^"']+)["']/g)].map(match => match[1]);
  const modules: Record<string, unknown> = Object.fromEntries(imports.map(name => [name, {}]));
  Object.assign(modules, {
    "@/lib/prisma": { prisma: { communicationDelivery: {
      findUnique: async () => ({ id: "archive", status: "FAILED", channel: "EMAIL", variables: { giftItemId: "111111111111111111111111" }, retriedAt: null, retryOfDeliveryId: null }),
      update: async () => { calls.originalStamped++; },
    }, donationItem: { findUnique: async () => ({ donationId: "donation", giftDeliveryState: { EMAIL: { status, at: "now", providerMessageId: "accepted" } } }) } } },
    "./communication-runtime-types": { isCommunicationChannel: () => true, RETRYABLE_STATUSES: ["FAILED", "SKIPPED"], NON_RETRYABLE_TERMINAL: [] },
    "./provider-router": { sendPreparedDelivery: async () => { calls.genericSend++; throw new Error("Gift must not use generic retry"); } },
    "@/lib/donations/gift-delivery": { deliverDonationGifts: async () => { calls.central++; } },
    "@/lib/donations/gift-delivery-state": { readGiftDeliveryState },
  });
  const service = fixtureModule<{ retryDelivery: (id: string) => Promise<{ code: string }> }>("lib/communication/delivery-retry-service.ts", modules);
  return { calls, run: () => service.retryDelivery("archive") };
}
test("archive retries delegate gifts to their item lease and preserve the historical failed record", async () => {
  const f = retry("SENT"); assert.equal((await f.run()).code, "SENT");
  assert.equal(f.calls.central, 1); assert.equal(f.calls.genericSend, 0); assert.equal(f.calls.originalStamped, 1);
});
test("an uncertain gift cannot be replayed through the generic archive retry", async () => {
  const f = retry("SENDING"); assert.equal((await f.run()).code, "DELIVERY_OUTCOME_UNCERTAIN");
  assert.equal(f.calls.genericSend, 0); assert.equal(f.calls.originalStamped, 0);
});
