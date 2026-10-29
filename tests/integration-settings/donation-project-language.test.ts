import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as locales from "../../lib/locales";
import * as projects from "../../lib/templates/donation-projects";
import * as money from "../../lib/templates/money";
import * as donationMoney from "../../lib/templates/donation-money";
import type { TemplateContext } from "../../lib/templates/variables";

const arabicTitle = "دعم الأسر المتعففة في القدس";
const turkishTitle = "Kudüs'teki ihtiyaç sahibi ailelere destek";
const campaign = { title: arabicTitle, translations: locales.SUPPORTED_LOCALES.filter((locale) => locale !== "ar").map((locale) => ({ locale, title: locale === "tr" ? turkishTitle : `Project ${locale}` })) };
const category = { name: "القدس", translations: locales.SUPPORTED_LOCALES.filter((locale) => locale !== "ar").map((locale) => ({ locale, name: `Category ${locale}` })) };
const row = {
  id: "donation", donorId: "donor", locale: "tr", amount: 498.56, amountUSD: 15, totalAmount: 498.56,
  currency: "TRY", teamSupport: 0, fees: 0, status: "PAID", paidAt: new Date("2026-10-29T08:00:00Z"), createdAt: new Date("2026-10-29T08:00:00Z"),
  items: [{ amount: 498.56, amountUSD: 15, shareCount: null, campaign }], categoryItems: [], waqfItems: [],
};

test("Turkish project names use saved Turkish translations rather than the canonical Arabic name", () => {
  const result = projects.donationProjectSummary(row);
  assert.equal(result.campaignTitle, turkishTitle);
  assert.equal(result.lines[0].amount, 498.56);
  assert.equal(result.lines[0].amountUSD, 15);
});

for (const locale of locales.SUPPORTED_LOCALES) {
  test(`${locale}: every project/category line and the summary use that exact saved language`, () => {
    const result = projects.donationProjectSummary({ ...row, locale, categoryItems: [{ amount: 5, amountUSD: 5, category }] });
    const title = locale === "ar" ? arabicTitle : campaign.translations.find((t) => t.locale === locale)!.title;
    const name = locale === "ar" ? category.name : category.translations.find((t) => t.locale === locale)!.name;
    assert.equal(result.lines[0].campaignTitle, title);
    assert.equal(result.lines[1].campaignTitle, name);
    assert.ok(result.campaignTitle.includes(title) && result.campaignTitle.includes(name));
  });
}

test("missing/blank translations never borrow Arabic or another language, and regional tags normalize", () => {
  assert.equal(projects.donationProjectSummary({ ...row, locale: "TR_tr" }).campaignTitle, turkishTitle);
  assert.equal(projects.donationCampaignTitle({ ...campaign, translations: [{ locale: "en", title: "English title" }, { locale: "tr", title: "  " }] }, "tr"), "Bağış projesi");
  const missing = projects.donationProjectSummary({ ...row, categoryItems: [{ amount: 1, amountUSD: 1, category: { name: "تصنيف عربي" } }], items: [{ ...row.items[0], campaign: { title: arabicTitle } }] });
  assert.deepEqual(missing.lines.map((line) => line.campaignTitle), ["Bağış projesi", "Bağış kategorisi"]);
  assert.doesNotMatch(missing.campaignTitle, /[\u0600-\u06ff]/);
  assert.equal(projects.donationMessageLocale("unknown", "TR-tr"), "tr");
  assert.equal(projects.donationMessageLocale("nb-NO"), "no");
  assert.equal(projects.donationMessageLocale(null, "unknown"), "ar");
});

function load<T>(path: string, dependencies: Record<string, unknown>): T {
  const mod = { exports: {} as T };
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(code, { filename: path }).runInNewContext({
    module: mod, exports: mod.exports, Date, console,
    fetch: () => { throw new Error("No external request is permitted in the language fixture"); },
    require: (id: string) => { assert.ok(id in dependencies, `Unexpected dependency: ${id}`); return dependencies[id]; },
  });
  return mod.exports;
}

type ContextLoaders = {
  loadContext: (id: string) => Promise<TemplateContext>;
  loadContextForDonation: (id: string, locale?: string) => Promise<TemplateContext>;
  loadContextsForUserIds: (ids: string[]) => Promise<Map<string, TemplateContext>>;
  mergeText: (text: string, ctx: TemplateContext) => string;
};

function contextFixture(donationLocale: string | null = "tr", donorLocale: string | null = "ar") {
  const donation = { ...row, locale: donationLocale };
  const user = { id: "donor", name: "Fixture Donor", email: "fixture@example.test", phone: "+905550000000", preferredLang: donorLocale };
  const queries: Array<{ select: unknown }> = [];
  const prisma = {
    user: { findUnique: async () => user, findMany: async () => [user] },
    donation: {
      findUnique: async (query: { select: unknown }) => { queries.push(query); return donation; },
      findMany: async (query: { select: unknown }) => { queries.push(query); return [donation]; },
    },
  };
  const contexts = load<ContextLoaders>("lib/templates/variables.ts", {
    "@/lib/prisma": { prisma }, "./money": money, "./donation-money": donationMoney,
    "./donation-projects": projects, "./variable-catalog": { VARIABLE_CATALOG: [] },
  });
  return { contexts, queries };
}

for (const [donationLocale, donorLocale, expected] of [
  ["tr", "ar", "tr"], ["ar", "tr", "ar"], [null, "tr", "tr"], ["unknown", "en", "en"], ["TR-tr", "en", "tr"], [null, null, "ar"],
] as const) {
  test(`actual notification context selects ${expected} for checkout=${donationLocale}, account=${donorLocale}`, async () => {
    const { contexts, queries } = contextFixture(donationLocale, donorLocale);
    const context = await contexts.loadContextForDonation("donation");
    const title = expected === "ar" ? arabicTitle : campaign.translations.find((t) => t.locale === expected)!.title;
    assert.equal(context.donation?.locale, expected);
    assert.equal(context.donation?.campaignTitle, title);
    assert.equal(context.donation?.items[0].campaignTitle, title);
    assert.equal(context.donations[0].campaignTitle, title);
    assert.equal(context.user.preferredLang, donorLocale ?? ""); // never overwrite the profile
    assert.equal(context.donation?.currency, "TRY"); // currency does not select a language
    for (const query of queries) {
      const selection = query.select as { items: { select: { campaign: { select: { translations: unknown } } } }; categoryItems: { select: { category: { select: { translations: unknown } } } } };
      assert.deepEqual(JSON.parse(JSON.stringify(selection.items.select.campaign.select.translations)), { select: { locale: true, title: true } });
      assert.deepEqual(JSON.parse(JSON.stringify(selection.categoryItems.select.category.select.translations)), { select: { locale: true, name: true } });
    }
  });
}

test("manual resend language overrides checkout while marketing/history keep the recipient preference", async () => {
  const { contexts } = contextFixture("tr", "en");
  assert.equal((await contexts.loadContextForDonation("donation", "fr")).donation?.campaignTitle, "Project fr");
  assert.equal((await contexts.loadContext("donor")).donations[0].campaignTitle, "Project en");
  assert.equal((await contexts.loadContextsForUserIds(["donor"])).get("donor")?.donations[0].campaignTitle, "Project en");
});

test("real event dispatch renders Turkish project names in email, SMS and Meta parameters despite an Arabic account preference", async () => {
  const { contexts } = contextFixture("tr", "ar");
  const sent: Array<Record<string, unknown>> = [];
  const body = "Proje: {{donation.campaignTitle}} / {{donation.amount}} {{donation.currency}}";
  const document = { text: { type: "Text", data: { props: { text: body } } } };
  const tpl = { id: "template", name: "Confirmation", subject: "تأكيد", body: "اسم المشروع: {{donation.campaignTitle}}", document: {}, translations: { tr: { subject: "Bağış onayı", body, document } } };
  const resolver = load<{ pickLocale: unknown; resolveEmailVariant: unknown; resolveWhatsappBody: unknown }>("lib/templates/locale-resolver.ts", { "@/lib/locales": locales });
  const dispatch = load<{ dispatchEvent: (event: string, input: { donationId: string }) => Promise<{ errors: number; emailsSent: number; smsSent: number; whatsappSent: number }> }>("lib/events/dispatch.ts", {
    "@/lib/prisma": { prisma: {
      messageTrigger: { findMany: async () => ["EMAIL", "SMS", "WHATSAPP"].map((channel) => ({ channel, templateId: channel })) },
      emailTemplate: { findUnique: async () => tpl }, smsTemplate: { findUnique: async () => tpl }, whatsappTemplate: { findUnique: async () => tpl },
      $runCommandRaw: async () => ({ n: 1 }),
    } },
    "@/lib/templates/variables": contexts, "@/lib/templates/donation-money": donationMoney,
    "@/lib/templates/locale-resolver": resolver,
    "@/lib/templates/render": {
      renderEmailHtml: async (doc: typeof document, context: TemplateContext) => contexts.mergeText(doc.text.data.props.text, context),
      renderEmailSubject: (subject: string, context: TemplateContext) => contexts.mergeText(subject, context),
    },
    "@/lib/templates/localize-donation-failure-link": { localizeDonationFailureLinks: (value: string) => value },
    "@/lib/communication/sender-resolution": { loadSenderRoutingSnapshot: async () => ({}), resolveSenderFromSnapshot: () => ({ ok: true, sender: { id: "sender", senderEmail: "fixture@example.test", phoneNumberId: "number", businessAccountId: "waba" } }) },
    "@/lib/communication/automatic-message-dispatcher": {
      sendAutomaticEmailMessage: async (input: Record<string, unknown>) => { sent.push(input); return { outcome: "SENT" }; },
      sendAutomaticSmsMessage: async (input: Record<string, unknown>) => { sent.push(input); return { outcome: "SENT" }; },
      sendAutomaticWhatsappMessage: async (input: Record<string, unknown>) => { sent.push(input); return { outcome: "SENT" }; },
      resolveMetaTemplateMapping: async () => ({ positionalNames: ["donation.campaignTitle"], scopedNames: {}, componentsSchema: [{ type: "BODY", text: "Proje: {{1}}" }] }),
    },
    "@/lib/audit-log": { writeAuditLog: async () => undefined }, "@/lib/dashboard/audit-log-display": { triggerEventLabelAr: () => "Fixture" },
    "@/lib/telegram/notify": { notifyDonationEvent: async () => undefined }, "@/lib/certificates/issue": { ensureDonationDocuments: async () => null },
    "@vercel/analytics/server": {}, "@/lib/tracking/donation-conversion-server": {}, "@/lib/communication/donor-communication-profile-service": {}, "@/lib/certificates/generate": {}, "@/lib/server-base-url": {},
  });
  const result = await dispatch.dispatchEvent("DONATION_PAID", { donationId: "donation" });
  assert.equal(result.errors, 0);
  assert.equal(result.emailsSent + result.smsSent + result.whatsappSent, 3);
  assert.equal(sent.length, 3);
  for (const message of sent) {
    assert.equal(message.locale, "tr");
    assert.ok(String(message.renderedBody).includes(turkishTitle));
    assert.doesNotMatch(String(message.renderedBody), /[\u0600-\u06ff]/);
  }
  assert.equal(sent[0].renderedSubject, "Bağış onayı");
  assert.equal((sent[2].templateValues as Record<string, string>)["donation.campaignTitle"], turkishTitle);
  assert.equal((sent[2].templateValues as Record<string, string>)["1"], turkishTitle);
});

test("gift email and WhatsApp use the same translated project name without changing the donation", async () => {
  const bodies: string[] = [];
  let selection: unknown;
  let delivered = 0;
  const gift = load<{ deliverDonationGifts: (id: string) => Promise<{ emailsSent: number; whatsappSent: number; errors: number }> }>("lib/donations/gift-delivery.ts", {
    "server-only": {}, "@/lib/templates/donation-projects": projects,
    "@/lib/prisma": { prisma: {
      donationItem: {
        findMany: async (query: { include: unknown }) => { selection = query.include; return [{ id: "gift", campaign: { ...campaign, slug: "family-support" }, amount: 498.56, giftRecipientName: "Gift Recipient", giftRecipientEmail: "gift@example.test", giftRecipientPhone: "+905550000001", giftChannels: ["EMAIL", "WHATSAPP"], giftShowAmount: false, giftMessage: null }]; },
        update: async () => { delivered += 1; },
      },
      donation: { findUnique: async () => ({ currency: "TRY", locale: "tr", donor: { name: "Fixture Donor" } }) },
    } },
    "@/i18n/locale-messages": { messagesFor: () => ({ Gift: { emailTitle: "Hediye bağış", emailSubject: "Hediye bağış", emailBody: "Proje: {project}", whatsappBody: "Proje: {project}" } }) },
    "@/lib/certificates/generate": { generateThanksPdf: async () => ({ filename: "fixture.pdf", pdf: { toString: () => "fixture" } }) },
    "@/lib/certificates/issue": { ensureDonationDocuments: async () => ({ locale: "tr", thanks: {} }) },
    "@/lib/communication/providers/email/client": { sendEmailMessage: async (input: { html: string }) => { bodies.push(input.html); return { ok: true }; } },
    "@/lib/communication/providers/meta-whatsapp/client": { getMetaConfig: async () => ({ defaultPhoneNumberId: "sender" }), graphFetch: async (_config: unknown, _path: string, input: { body: string }) => { bodies.push(JSON.parse(input.body).text.body); return { ok: true }; } },
    "@/lib/events/dispatch": { resolveTriggerSendConfig: async () => ({}), resolveTriggerSender: () => ({ ok: true, sender: {} }) },
    "@/lib/server-base-url": { getServerBaseUrl: async () => "https://donation.example.test" },
    "@/lib/minbar/routes": { miaPath: () => "/tr/projects/family-support" },
    "@/lib/audit-log": { writeAuditLog: async () => undefined },
  });
  const result = await gift.deliverDonationGifts("donation");
  assert.equal(result.errors, 0);
  assert.equal(result.emailsSent + result.whatsappSent, 2);
  assert.equal(delivered, 1);
  assert.match(JSON.stringify(selection), /translations/);
  for (const body of bodies) {
    assert.ok(body.replace(/&#39;/g, "'").includes(turkishTitle));
    assert.doesNotMatch(body, /[\u0600-\u06ff]/);
  }
});
