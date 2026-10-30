import test from "node:test";
import assert from "node:assert/strict";
import { ensureManagedWhatsappDraft } from "../../scripts/ensure-managed-whatsapp-draft.mjs";
import { greetingTemplateDraft } from "../../lib/communication/greeting-template-draft";
import { giftTemplateBody, legacyGiftTemplateBody, GIFT_WHATSAPP_TEMPLATE } from "../../lib/donations/gift-template-draft";
import { SUPPORTED_LOCALES } from "../../lib/locales";
import { messagesFor } from "../../i18n/locale-messages";

const greeting = (legacy = false) => ({ ...greetingTemplateDraft(legacy), provider: "META_WHATSAPP", channel: "WHATSAPP", kind: "CAMPAIGN", purpose: "MARKETING", category: "MARKETING", language: "ar" });
const gift = (legacy = false) => {
  const translations = Object.fromEntries(SUPPORTED_LOCALES.map(locale => [locale, { body: (legacy ? legacyGiftTemplateBody : giftTemplateBody)(messagesFor(locale).Gift, locale) }]));
  return { name: GIFT_WHATSAPP_TEMPLATE, body: translations.ar.body, translations, provider: "META_WHATSAPP", channel: "WHATSAPP", kind: "SYSTEM", purpose: "UTILITY", category: "UTILITY", language: "ar" };
};
type Variant = { languageCode: string; locale?: string; providerTemplateId?: string; approvalStatus?: string };
function fixture(seed?: Record<string, unknown>, options: { exact?: Variant[]; aggregate?: Variant[]; fail?: "exact" | "aggregate"; duplicate?: boolean; conflict?: boolean } = {}) {
  let current: Record<string, unknown> | undefined = seed ? { id: "managed", status: "DRAFT", updatedAt: new Date("2026-10-29"), ...structuredClone(seed) } : undefined;
  const calls = { creates: 0, updates: 0, variantReads: 0 };
  const tx = {
    whatsappTemplate: {
      findMany: async () => current ? options.duplicate ? [current, { ...current, id: "duplicate" }] : [current] : [],
      create: async ({ data }: { data: Record<string, unknown> }) => { calls.creates++; return current = { id: "managed", ...data }; },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        calls.updates++; assert.equal(where.updatedAt, current?.updatedAt);
        if (options.conflict) return { count: 0 };
        current = { ...current, ...structuredClone(data) }; return { count: 1 };
      },
    },
    whatsappTemplateWabaVariant: { findMany: async () => { calls.variantReads++; if (options.fail === "exact") throw new Error("exact read failed"); return options.exact ?? []; } },
    whatsappTemplateVariant: { findMany: async () => { calls.variantReads++; if (options.fail === "aggregate") throw new Error("aggregate read failed"); return options.aggregate ?? []; } },
  };
  return { prisma: { $transaction: async (run: (value: typeof tx) => unknown) => run(tx) }, calls, current: () => current };
}
test("a new managed draft is created without querying provider variants", async () => {
  const f = fixture(); const result = await ensureManagedWhatsappDraft(f.prisma, { draft: gift(), previousDraft: gift(true), mutableLocales: [...SUPPORTED_LOCALES] });
  assert.equal(result.created, true); assert.equal(f.calls.creates, 1); assert.equal(f.calls.variantReads, 0); assert.equal(result.template.status, "DRAFT");
});
test("the exact failed gift seed is repaired in every language and then remains idempotent", async () => {
  const f = fixture(gift(true)); const options = { draft: gift(), previousDraft: gift(true), mutableLocales: [...SUPPORTED_LOCALES] };
  const result = await ensureManagedWhatsappDraft(f.prisma, options);
  assert.deepEqual(result.repairedLocales.sort(), [...SUPPORTED_LOCALES].sort());
  assert.equal(result.template.name, GIFT_WHATSAPP_TEMPLATE); assert.equal(f.calls.updates, 1);
  await ensureManagedWhatsappDraft(f.prisma, options); assert.equal(f.calls.updates, 1);
});
test("only Japanese and Chinese change in the greeting's existing provider family", async () => {
  const before = greeting(true), after = greeting();
  assert.equal(before.name, after.name);
  const exact = SUPPORTED_LOCALES.filter(locale => !["ja", "zh"].includes(locale)).map(locale => ({ locale, languageCode: locale, providerTemplateId: "accepted-" + locale, approvalStatus: "APPROVED" }));
  const f = fixture({ ...before, externalTemplateId: "existing-family" }, { exact });
  const result = await ensureManagedWhatsappDraft(f.prisma, { draft: after, previousDraft: before, mutableLocales: ["ja", "zh"] });
  assert.deepEqual(result.repairedLocales.sort(), ["ja", "zh"]);
  for (const locale of SUPPORTED_LOCALES.filter(locale => !["ja", "zh"].includes(locale))) assert.deepEqual(after.translations[locale], before.translations[locale]);
  assert.equal(f.current()?.externalTemplateId, "existing-family");
});
for (const mode of ["exact", "aggregate"] as const) test(`a submitted greeting locale in ${mode} evidence cannot be overwritten`, async () => {
  const f = fixture(greeting(true), { [mode]: [{ languageCode: "zh_CN", providerTemplateId: "provider-owned", approvalStatus: "PENDING" }] });
  await assert.rejects(() => ensureManagedWhatsappDraft(f.prisma, { draft: greeting(), previousDraft: greeting(true), mutableLocales: ["ja", "zh"] }), /SUBMITTED_CONTENT_IS_IMMUTABLE/);
  assert.equal(f.calls.updates, 0);
});
for (const fail of ["exact", "aggregate"] as const) test(`${fail} evidence read failure stops repair before a write`, async () => {
  const f = fixture(gift(true), { fail });
  await assert.rejects(() => ensureManagedWhatsappDraft(f.prisma, { draft: gift(), previousDraft: gift(true), mutableLocales: [...SUPPORTED_LOCALES] }), /read failed/);
  assert.equal(f.calls.updates, 0);
});
test("operator edits, archives and ambiguous duplicate names remain untouched", async () => {
  for (const [seed, options] of [[{ ...gift(true), body: "Operator edited this message" }, {}], [{ ...gift(true), status: "ARCHIVED" }, {}], [gift(true), { duplicate: true }]] as const) {
    const f = fixture(seed, options);
    await assert.rejects(() => ensureManagedWhatsappDraft(f.prisma, { draft: gift(), previousDraft: gift(true), mutableLocales: [...SUPPORTED_LOCALES] }), /REQUIRE_REVIEW|ARCHIVED|AMBIGUOUS/);
    assert.equal(f.calls.updates + f.calls.creates, 0);
  }
});
test("a stale draft snapshot cannot report a successful repair", async () => {
  const f = fixture(gift(true), { conflict: true });
  await assert.rejects(() => ensureManagedWhatsappDraft(f.prisma, { draft: gift(), previousDraft: gift(true), mutableLocales: [...SUPPORTED_LOCALES] }), /CONCURRENT_CHANGE/);
});
test("a provider family without locale rows still protects its root body", async () => {
  const f = fixture({ ...gift(true), externalTemplateId: "known-provider-template" });
  await assert.rejects(() => ensureManagedWhatsappDraft(f.prisma, { draft: gift(), previousDraft: gift(true), mutableLocales: [...SUPPORTED_LOCALES] }), /SUBMITTED_CONTENT_IS_IMMUTABLE/);
  assert.equal(f.calls.updates, 0);
});
