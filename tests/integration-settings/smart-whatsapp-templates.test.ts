import test from "node:test";
import assert from "node:assert/strict";
import { smartWhatsappTemplateChoices } from "../../lib/communication/smart-whatsapp-templates";
import { resolveVariantForLocale, type VariantRow } from "../../lib/communication/whatsapp-template-readiness";

const variant = (changes: Partial<VariantRow & { businessAccountId: string }> = {}) => ({
  businessAccountId: "waba-a", languageCode: "ar", locale: "ar", approvalStatus: "APPROVED",
  category: "UTILITY", providerTemplateName: "receipt", componentsSchema: [],
  rejectionReason: null, lastSyncedAt: new Date("2026-10-19T00:00:00Z"), ...changes,
});
const routes = { UTILITY: "waba-a", MARKETING: "waba-a" };

test("approved exact WABA is available even when another account has no approval", () => {
  const templates = [{ id: "receipt", name: "Receipt", wabaVariants: [
    variant(), variant({ businessAccountId: "waba-b", approvalStatus: "PENDING" }),
  ] }];
  assert.deepEqual(smartWhatsappTemplateChoices(templates, "ar", routes).utilityTemplates,
    [{ id: "receipt", name: "Receipt", category: "UTILITY" }]);
  assert.deepEqual(smartWhatsappTemplateChoices(templates, "ar", { UTILITY: "waba-b", MARKETING: "waba-b" }).utilityTemplates, []);
});

test("an approval on a different WABA cannot make a template sendable", () => {
  const templates = [{ id: "receipt", name: "Receipt", wabaVariants: [variant({ businessAccountId: "waba-b" })] }];
  assert.deepEqual(smartWhatsappTemplateChoices(templates, "ar", routes), { utilityTemplates: [], marketingTemplates: [] });
});

test("Meta recategorization determines the tab instead of stale local taxonomy", () => {
  const templates = [{ id: "receipt", name: "Receipt", category: "UTILITY", purpose: "TRANSACTIONAL", wabaVariants: [variant({ category: "MARKETING" })] }];
  const result = smartWhatsappTemplateChoices(templates, "ar", routes);
  assert.deepEqual(result.utilityTemplates, []);
  assert.deepEqual(result.marketingTemplates, [{ id: "receipt", name: "Receipt", category: "MARKETING" }]);
});

test("Utility and Marketing use their independently routed business accounts", () => {
  const templates = [{ id: "shared", name: "Shared", wabaVariants: [variant(), variant({ businessAccountId: "waba-b", category: "MARKETING" })] }];
  const result = smartWhatsappTemplateChoices(templates, "ar", { UTILITY: "waba-a", MARKETING: "waba-b" });
  assert.equal(result.utilityTemplates[0]?.category, "UTILITY");
  assert.equal(result.marketingTemplates[0]?.category, "MARKETING");
});

test("unapproved and unknown-category templates never appear in send choices", () => {
  const templates = ["PENDING", "REJECTED", "PAUSED", "DISABLED"].map((status) => ({
    id: status, name: status, wabaVariants: [variant({ approvalStatus: status })],
  }));
  templates.push({ id: "unknown", name: "Unknown", wabaVariants: [variant({ category: null })] });
  assert.deepEqual(smartWhatsappTemplateChoices(templates, "ar", routes), { utilityTemplates: [], marketingTemplates: [] });
});

test("listing and sending share exact-language and Arabic-fallback selection", () => {
  const variants = [variant(), variant({ languageCode: "en_US", locale: "en", category: "MARKETING" })];
  const templates = [{ id: "receipt", name: "Receipt", wabaVariants: variants }];
  assert.equal(resolveVariantForLocale(variants, "en").languageCode, "en_US");
  assert.equal(smartWhatsappTemplateChoices(templates, "en", routes).marketingTemplates.length, 1);
  assert.equal(resolveVariantForLocale(variants, "tr").languageCode, "ar");
  assert.equal(smartWhatsappTemplateChoices(templates, "tr", routes).utilityTemplates.length, 1);
});

test("unrelated approved languages without a supported fallback remain unavailable", () => {
  const templates = [{ id: "receipt", name: "Receipt", wabaVariants: [variant({ locale: "en", languageCode: "en_US" })] }];
  assert.deepEqual(smartWhatsappTemplateChoices(templates, "tr", routes).utilityTemplates, []);
});

test("a missing routed WABA does not fall back to another account", () => {
  const templates = [{ id: "receipt", name: "Receipt", wabaVariants: [variant()] }];
  assert.deepEqual(smartWhatsappTemplateChoices(templates, "ar", { UTILITY: null, MARKETING: null }), { utilityTemplates: [], marketingTemplates: [] });
});
