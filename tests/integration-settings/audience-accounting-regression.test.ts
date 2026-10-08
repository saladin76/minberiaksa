import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { campaignAudienceSelectionCount, recipientExclusionReason, type AudienceChannel, type RecipientConsent } from "../../lib/communication/campaign-audience-accounting";
import { summarizeCampaignAudience, type AudienceAccountingRow } from "../../lib/communication/audience-preview-accounting";
import { normalizeCampaignContact } from "../../lib/communication/campaign-contact-validation";

// Execute source modules with explicit dependencies. No live database or provider
// is loaded by these tests; unexpected imports fail rather than escaping the mocks.
function loadIsolated<T>(file: string, dependencies: Record<string, unknown>): T {
  const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new vm.Script(output, { filename: file }).runInNewContext({
    module, exports: module.exports,
    require: (id: string) => {
      if (!(id in dependencies)) throw new Error(`Unexpected dependency: ${id}`);
      return dependencies[id];
    },
  });
  return module.exports as T;
}

const allowed: RecipientConsent = { doNotContact: false, whatsappOptIn: true, emailOptIn: true, smsOptIn: true };
const contact = { email: "donor@example.test", phone: "+905551112233" };
function row(id: number, patch: Partial<AudienceAccountingRow> = {}): AudienceAccountingRow {
  return { id: String(id).padStart(8, "0"), name: null, ...contact, locale: "ar", countryCode: "TR", communicationProfile: allowed, ...patch };
}
async function* rows(values: AudienceAccountingRow[]) { yield* values; }

for (const channel of ["WHATSAPP", "EMAIL", "SMS"] as const) {
  test(`${channel}: explicit consent is required and DNC takes precedence`, () => {
    assert.equal(recipientExclusionReason(contact, channel, allowed), null);
    assert.equal(recipientExclusionReason(contact, channel, { ...allowed, doNotContact: true }), "DO_NOT_CONTACT");
    assert.equal(recipientExclusionReason(contact, channel, null), "NEEDS_CONSENT_REVIEW");
    assert.equal(recipientExclusionReason(contact, channel, {}), `${channel === "WHATSAPP" ? "WHATSAPP" : channel}_OPT_IN_REQUIRED`);
  });
}

test("draft membership never claims all selected contacts have permission to send", () => {
  const preview = { matched: 14842, eligible: 5182, missingContact: 9000, doNotContact: 660 };
  assert.equal(campaignAudienceSelectionCount("WHATSAPP", preview), 14842);
  assert.equal(campaignAudienceSelectionCount("EMAIL", preview), 5182);
  assert.equal(campaignAudienceSelectionCount("WHATSAPP", null), 0);
  assert.equal(campaignAudienceSelectionCount("WHATSAPP", { ...preview, matched: NaN }), 0);
});

test("null, absent and empty contact values are all accounted for", () => {
  for (const phone of [null, undefined, ""]) {
    assert.equal(recipientExclusionReason({ phone }, "WHATSAPP", allowed), "MISSING_CONTACT");
  }
});

test("all selected rows reconcile once, including per-language exclusions", async () => {
  const result = await summarizeCampaignAudience(rows([
    row(1), row(2, { phone: null }), row(3, { communicationProfile: null }),
    row(4, { phone: null, communicationProfile: { ...allowed, doNotContact: true } }),
    row(5, { locale: "en", communicationProfile: { ...allowed, whatsappOptIn: false } }),
    row(6, { locale: "en" }),
  ]), "WHATSAPP");
  assert.equal(result.matched, 6);
  assert.equal(result.eligible, 2);
  assert.equal(result.missingContact, 1);
  assert.equal(result.doNotContact, 1);
  assert.equal(result.needsReview, 2);
  assert.equal(result.unavailable, 4);
  for (const bucket of Object.values(result.localeBreakdown)) {
    assert.equal(bucket.total, bucket.eligible + bucket.missingContact + bucket.doNotContact + bucket.needsReview);
  }
  assert.equal(Object.values(result.languages).reduce((a, b) => a + b, 0), result.matched);
  assert.equal(Object.values(result.eligibleLanguages).reduce((a, b) => a + b, 0), result.eligible);
});

test("large audiences are not truncated to the preview sample", async () => {
  async function* large() { for (let i = 1; i <= 14842; i++) yield row(i); }
  const result = await summarizeCampaignAudience(large(), "WHATSAPP", 5000);
  assert.equal(result.matched, 14842);
  assert.equal(result.eligible, 14842);
  assert.equal(result.sample.length, 50);
});

test("a failed source page rejects the preview rather than returning partial counts", async () => {
  async function* broken() { yield row(1); throw new Error("DATABASE_READ_FAILED"); }
  await assert.rejects(summarizeCampaignAudience(broken(), "WHATSAPP"), /DATABASE_READ_FAILED/);
});

test("repeated cursors reject instead of duplicating recipients", async () => {
  await assert.rejects(summarizeCampaignAudience(rows([row(1), row(1)]), "WHATSAPP"), /AUDIENCE_CURSOR_NOT_ADVANCING/);
});

test("cancelled and empty previews do not become fabricated successful counts", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(summarizeCampaignAudience(rows([]), "WHATSAPP", 0, controller.signal));
  const empty = await summarizeCampaignAudience(rows([]), "WHATSAPP", 0);
  assert.equal(empty.matched, 0); assert.equal(empty.sample.length, 0);
});

test("execution normalizes known international formatting without changing the destination", () => {
  for (const phone of ["+90 (555) 111-22-33", "00905551112233", "905551112233"]) {
    assert.equal(normalizeCampaignContact("WHATSAPP", phone), contact.phone);
  }
  for (const phone of ["", "05551112233", "++905551112233", "abc905551112233", "+905551112233 ext 5", "+123", "+1234567890123456"]) {
    assert.equal(normalizeCampaignContact("WHATSAPP", phone), null);
  }
  assert.equal(normalizeCampaignContact("EMAIL", " Donor@Example.test "), contact.email);
  assert.equal(normalizeCampaignContact("EMAIL", "not-an-email"), null);
});

type GuardResult = { ok: boolean; contact?: string; reason?: string; unavailable?: boolean };
type GuardModule = { checkCampaignRecipientBeforeSend: (channel: AudienceChannel, id: string, planned: string) => Promise<GuardResult> };
const guardCases: Array<{ name: string; donor: unknown; planned?: string; throws?: boolean; expected: string | null }> = [
  { name: "current consent permits the unchanged destination", donor: { ...contact, communicationProfile: allowed }, expected: null },
  { name: "withdrawal after planning blocks the provider", donor: { ...contact, communicationProfile: { ...allowed, doNotContact: true } }, expected: "DO_NOT_CONTACT" },
  { name: "missing profile is not consent", donor: { ...contact, communicationProfile: null }, expected: "NEEDS_CONSENT_REVIEW" },
  { name: "unconfirmed WhatsApp consent stays blocked", donor: { ...contact, communicationProfile: { ...allowed, whatsappOptIn: false } }, expected: "WHATSAPP_OPT_IN_REQUIRED" },
  { name: "changed contact is never silently retargeted", donor: { ...contact, phone: "+905559998877", communicationProfile: allowed }, expected: "RECIPIENT_CONTACT_CHANGED" },
  { name: "invalid contact is rejected at execution", donor: { ...contact, phone: "wrong-number", communicationProfile: allowed }, expected: "INVALID_PHONE_FORMAT" },
  { name: "deleted donor is not sent", donor: null, expected: "RECIPIENT_NOT_FOUND" },
  { name: "read failure is not reported as an unsubscribe", donor: null, throws: true, expected: "CONSENT_CHECK_UNAVAILABLE" },
];
for (const scenario of guardCases) {
  test(`send guard: ${scenario.name}`, async () => {
    let reads = 0;
    const guard = loadIsolated<GuardModule>("lib/communication/campaign-recipient-guard.ts", {
      "@/lib/prisma": { prisma: { user: { findUnique: async () => { reads++; if (scenario.throws) throw new Error("offline"); return scenario.donor; } } } },
      "./campaign-audience-accounting": { recipientExclusionReason },
      "./campaign-contact-validation": { normalizeCampaignContact },
    });
    const result = await guard.checkCampaignRecipientBeforeSend("WHATSAPP", "fixture-id", scenario.planned ?? contact.phone);
    assert.equal(reads, 1);
    assert.equal(result.ok, scenario.expected === null);
    assert.equal(result.reason ?? null, scenario.expected);
    if (scenario.throws) assert.equal(result.unavailable, true);
  });
}
