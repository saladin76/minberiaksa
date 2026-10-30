import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { SUPPORTED_LOCALES } from "../../lib/locales";
import { confirmedTryCharge, receiptDate, receiptMoney, RECEIPT_BANK_COPY, RECEIPT_BRANDS, localizeReceiptFooter } from "../../lib/templates/receipt-localization";
import { donationMoneyFields, donationNotificationDocument, donationNotificationText, donationReceiptText } from "../../lib/templates/donation-money";
import * as money from "../../lib/templates/donation-money";
import * as upgrades from "../../lib/communication/notification-template-upgrade";
import { buildStandardMetaComponents } from "../../lib/communication/meta-template-components";
import { buildMetaComponents } from "../../lib/communication/providers/meta-whatsapp/parameters";
import { hasWhatsappUnsubscribeQuickReply, whatsappUnsubscribeCopy } from "../../lib/communication/whatsapp-template-unsubscribe";

const evidence = { provider: "ALBARAKA", providerOrderId: "order-a", paidAt: new Date("2026-10-29T09:00:00Z"), status: "PAID", providerRaw: { albarakaRequest: { orderId: "order-a", amount: 410025, currencyCode: "TL" } } };
const donation = { ...evidence, currency: "EUR", amount: 80, teamSupport: 20, fees: 3, totalAmount: 103 };

test("TRY bank proof uses exact paid order, provider, currency and the provider's unit scale", () => {
  assert.equal(confirmedTryCharge(evidence), 4100.25);
  assert.equal(confirmedTryCharge({ ...evidence, providerRaw: { albarakaRecurring: { orderId: "order-a", amount: 410025, currencyCode: "TL" } } }), 4100.25);
  assert.equal(confirmedTryCharge({ ...evidence, provider: "PAYFOR", providerRaw: { payforRequest: { orderId: "order-a", purchAmount: "4100.25", currency: "949" } } }), 4100.25);
  for (const change of [ { paidAt: null }, { paidAt: "invalid" }, { status: "FAILED" }, { status: "REFUNDED" }, { provider: "PAYPAL" }, { provider: "STRIPE" }, { provider: "CASH" }, { providerOrderId: "another-attempt" }, { providerOrderId: null }, { providerRaw: null } ]) assert.equal(confirmedTryCharge({ ...evidence, ...change }), null);
  for (const request of [{ amount: 0 }, { amount: -1 }, { amount: 1.1 }, { amount: "Infinity" }, { amount: Number.MAX_SAFE_INTEGER + 1 }, { currencyCode: "US" }, { currencyCode: "EU" }, { orderId: "old-order" }]) assert.equal(confirmedTryCharge({ ...evidence, providerRaw: { albarakaRequest: { ...evidence.providerRaw.albarakaRequest, ...request } } }), null);
  for (const purchAmount of ["0", "-1", "1.001", "1e3", "Infinity", "invalid"]) assert.equal(confirmedTryCharge({ ...evidence, provider: "PAYFOR", providerRaw: { payforRequest: { orderId: "order-a", currency: "949", purchAmount } } }), null);
});

for (const locale of SUPPORTED_LOCALES) test(`${locale}: only the stored total and native currency are shown in one locale`, () => {
  const value = donationMoneyFields(donation, locale).receiptSummary;
  assert.ok(value.includes(receiptMoney(103, "EUR", locale)));
  assert.equal(value, `${money.DONATION_MONEY_LABELS[locale][3]}: ${receiptMoney(103, "EUR", locale)}`);
  assert.ok(!value.includes(RECEIPT_BANK_COPY[locale][0]) && !value.includes(RECEIPT_BANK_COPY[locale][1]));
  assert.ok(!/[\n\t]/.test(value));
  assert.equal(localizeReceiptFooter("Minbar Al-Aqsa | منبر الأقصى", locale), RECEIPT_BRANDS[locale]);
  assert.equal(receiptDate(evidence.paidAt, locale), new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(evidence.paidAt));
  if (!["ar", "ur"].includes(locale)) assert.ok(!/[\u0600-\u06ff]/.test(value + RECEIPT_BRANDS[locale]));
  for (const change of [{ paidAt: null }, { providerOrderId: "mismatch" }, { provider: "PAYPAL" }, { providerRaw: null }, { currency: "TRY" }]) assert.ok(!donationMoneyFields({ ...donation, ...change }, locale).receiptSummary.includes(RECEIPT_BANK_COPY[locale][0]));
});

test("native currency precision is retained; no USD snapshot is used for receipt values", () => {
  assert.ok(donationMoneyFields({ ...donation, currency: "KWD", amount: 1.234, totalAmount: 1.234, teamSupport: 0, fees: 0 }, "en").receiptSummary.startsWith("Total: 1.234 Kuwaiti dinars"));
  assert.ok(donationMoneyFields({ ...donation, currency: "JPY", amount: 123, totalAmount: 123, teamSupport: 0, fees: 0, providerRaw: null }, "ja").receiptSummary.includes("123"));
  assert.equal(donationMoneyFields({ ...donation, totalAmount: NaN }, "en").receiptSummary, "");
});

test("email/SMS replace legacy USD money without touching links, tags or explicit breakdowns", () => {
  const ctx = { donation: donationMoneyFields(donation, "tr") };
  const input = 'Tutar: {{donation.amountUSD}} USD <a href="/receipt?v={{donation.amountUSD}}">Belge</a> https://example.test/?v={{donation.amount}}';
  const prepared = donationNotificationText(input, ctx);
  assert.ok(prepared.startsWith("{{donation.receiptSummary}}"));
  assert.ok(prepared.includes('href="/receipt?v={{donation.amountUSD}}"') && prepared.includes("https://example.test/?v={{donation.amount}}"));
  assert.equal(donationReceiptText("{{donation.currency}} {{donation.totalAmount}}"), "{{donation.receiptSummary}}");
  assert.equal(donationReceiptText("${{donation.amountUSD}}"), "{{donation.receiptSummary}}");
  const document = { text: { type: "Text", data: { props: { text: "{{donation.amount}} {{donation.currency}}" } } }, footer: { type: "Text", data: { props: { text: "Minbar Al-Aqsa | منبر الأقصى" } } }, button: { type: "Button", data: { props: { url: "/api/receipt?v={{donation.amount}}" } } } };
  const rendered = donationNotificationDocument(document, ctx, "tr");
  assert.equal(rendered.text.data.props.text, "{{donation.receiptSummary}}");
  assert.equal(rendered.footer.data.props.text, RECEIPT_BRANDS.tr);
  assert.equal(rendered.button.data.props.url, document.button.data.props.url);
  assert.equal(document.footer.data.props.text, "Minbar Al-Aqsa | منبر الأقصى");
});

const sourceTemplate = () => {
  const body = "✅ *تبرعك تم بنجاح*\nالسلام عليكم ورحمة الله وبركاته، {{user.name}}\nالمشروع: {{donation.campaignTitle}}\nالمبلغ: {{donation.amount}} {{donation.currency}}\nتاريخ التبرع: {{donation.createdAt}}\nرقم التبرع: {{donation.id}}\nنسأل الله أن يبارك لك في مالك وأهلك، وأن يجعل ما قدّمته في ميزان حسناتك.\nhttps://minberiaksa.org/ar/account";
  const buttons = [{ type: "URL", text: "تحميل شهادة التبرع", url: "https://minberiaksa.org/api/donations/{{donation.id}}/certificate" }, { type: "URL", text: "تحميل وصل التبرع", url: "https://minberiaksa.org/api/donations/{{donation.id}}/receipt" }];
  const translations = Object.fromEntries(SUPPORTED_LOCALES.map(locale => [locale, { body: locale === "ar" ? body : `✅ ${locale} greeting {{user.name}}\nProject: {{donation.campaignTitle}}\nAmount: {{donation.amount}} {{donation.currency}}\nDate: {{donation.createdAt}}\nReference: {{donation.id}}\n${locale} prayer\nhttps://minberiaksa.org/${locale}/account`, buttons: buttons.map((b, i) => ({ ...b, text: `${locale} document ${i}` })), footerText: "Minbar Al-Aqsa | منبر الأقصى" }]));
  return { id: "source", name: "mia_donation_success_v2", body, buttons, translations, header: { type: "NONE" }, footerText: "Minbar Al-Aqsa | منبر الأقصى", kind: "SYSTEM", category: "UTILITY", purpose: "UTILITY" };
};
function providerVariants(draft: ReturnType<typeof upgrades.notificationUpgradeDraft>) {
  return SUPPORTED_LOCALES.map(locale => ({ languageCode: locale === "no" ? "nb" : locale, locale, approvalStatus: "APPROVED", category: draft.category ?? "UTILITY", providerTemplateName: draft.name, componentsSchema: buildStandardMetaComponents(draft.translations[locale]).components, rejectionReason: null, lastSyncedAt: new Date() }));
}

test("upgrade keeps every existing greeting, prayer, reference and document URL; actual Meta send schema accepts all 19", () => {
  const source = sourceTemplate();
  const original = JSON.stringify(source);
  const draft = upgrades.notificationUpgradeDraft(source, true);
  const canonical = buildStandardMetaComponents(draft.translations.ar);
  const positionalNames = canonical.bindings.map(row => row.key);
  const scopedNames = Object.fromEntries(canonical.bindings.map(row => [`${row.scope}.${row.position}`, row.key]));
  for (const locale of SUPPORTED_LOCALES) {
    const translated = draft.translations[locale];
    assert.equal(translated.body, money.donationReceiptText(source.translations[locale].body).replace("{{donation.createdAt}}", "{{donation.displayDate}}"));
    assert.deepEqual(translated.buttons, locale === "ar" ? source.buttons : source.translations[locale].buttons);
    assert.equal(translated.footerText, RECEIPT_BRANDS[locale]);
    const values: Record<string, string> = { "user.name": "Supporter", "donation.campaignTitle": "Project", "donation.receiptSummary": donationMoneyFields(donation, locale).receiptSummary, "donation.displayDate": receiptDate(evidence.paidAt, locale), "donation.id": "fixture" };
    const schema = buildStandardMetaComponents(translated).components;
    const built = buildMetaComponents({ componentsSchema: schema, values, positionalNames, scopedNames });
    assert.equal(built.ok, true, JSON.stringify(built));
  }
  assert.equal(JSON.stringify(source), original);
  assert.deepEqual(upgrades.approvedNotificationLocales(draft, providerVariants(draft)), [...SUPPORTED_LOCALES]);
  const variants = providerVariants(draft);
  variants[0].approvalStatus = "PENDING";
  assert.equal(upgrades.approvedNotificationLocales(draft, variants).length, 18);
  variants[0].approvalStatus = "APPROVED";
  variants[0].componentsSchema = [{ type: "BODY", text: "outdated provider body" }];
  assert.equal(upgrades.approvedNotificationLocales(draft, variants).length, 18);
});

test("missing translations/buttons and unsupported monetary copy need review; future subscription amount stays scalar", () => {
  const source = sourceTemplate();
  const missing = { ...source, translations: { ...source.translations, tr: {} } };
  assert.throws(() => upgrades.notificationUpgradeDraft(missing, true), /TRANSLATION_MISSING:tr/);
  const buttonsMissing = { ...source, translations: { ...source.translations, tr: { body: source.translations.tr.body } } };
  assert.throws(() => upgrades.notificationUpgradeDraft(buttonsMissing, true), /BUTTON_TRANSLATION_MISSING:tr/);
  assert.throws(() => upgrades.notificationUpgradeDraft({ ...source, body: "USD-only {{donation.totalAmount}}" }, true), /AMOUNT_REVIEW_REQUIRED/);
  assert.ok(upgrades.notificationUpgradeDraft(source, false).body.includes("{{donation.amount}} {{donation.currency}}"));
  assert.notEqual(upgrades.notificationUpgradeDraft(source, true).name, upgrades.notificationUpgradeDraft({ ...source, body: source.body + " Updated" }, true).name);
});

function serviceFixture(options: { pending?: boolean; changed?: boolean; duplicateDefault?: boolean; welcome?: boolean; wrongCategory?: boolean; mixedWelcome?: boolean } = {}) {
  const source = sourceTemplate();
  if (options.welcome) {
    source.name = "mia_user_registered_v2";
    source.body = "Welcome {{user.name}}. Your account is ready. Please contact our team if this was not you.";
    source.buttons = [];
    for (const locale of SUPPORTED_LOCALES) source.translations[locale] = { ...source.translations[locale], body: source.body, buttons: [] };
  }
  const draft = upgrades.notificationUpgradeDraft(source, !options.welcome, options.welcome);
  const candidate = { ...source, ...draft, id: "replacement", status: "DRAFT", notificationUpgrade: {} as Record<string, unknown> };
  candidate.notificationUpgrade = { version: options.welcome ? 3 : 1, ...(options.welcome ? { policy: "WELCOME_MARKETING_V3" } : {}), sourceId: source.id, sourceHash: draft.sourceHash, draftHash: upgrades.notificationTemplateHash(candidate), receipt: !options.welcome, events: [options.welcome ? "USER_REGISTERED" : "DONATION_PAID"] };
  const variants = providerVariants(draft);
  if (options.pending) variants[0].approvalStatus = "PENDING";
  if (options.wrongCategory) variants[0].category = "UTILITY";
  if (options.changed) source.body += " Editorial change";
  let triggerTarget = "source", writes = 0, createdData: Record<string, unknown> | undefined;
  const sender = { id: "default", enabled: true, status: "ACTIVE", businessAccountId: "default-waba" };
  const db = {
    communicationSender: { findMany: async () => options.duplicateDefault ? [sender, sender] : [sender] },
    whatsappTemplate: { findMany: async (args: { where: { name?: unknown } }) => args.where.name ? [candidate] : [source], findUnique: async (args: { where: { id: string } }) => args.where.id === source.id ? source : candidate, findFirst: async () => null, create: async ({ data }: { data: Record<string, unknown> }) => { writes++; createdData = data; return candidate; }, update: async () => { writes++; } },
    whatsappTemplateWabaVariant: { findMany: async (args: { where: { businessAccountId: string } }) => { assert.equal(args.where.businessAccountId, "default-waba"); return variants; } },
    messageTrigger: { findMany: async () => [{ id: "trigger", event: options.welcome ? "USER_REGISTERED" : "DONATION_PAID", templateId: triggerTarget }, ...(options.mixedWelcome ? [{ id: "other", event: "DONATION_PAID", templateId: triggerTarget }] : [])], updateMany: async (args: { data: { templateId: string } }) => { writes++; triggerTarget = args.data.templateId; return { count: 1 }; } },
  };
  const prisma = { ...db, $transaction: async (run: (tx: typeof db) => Promise<unknown>) => run(db) };
  const mod = { exports: {} as { prepareNotificationUpgrades: (opts?: unknown) => Promise<{ results: Array<{ state: string }> }>; activateApprovedNotificationUpgrades: () => Promise<{ results: Array<{ state: string }> }> } };
  const dependencies: Record<string, unknown> = { "server-only": {}, "@prisma/client": { Prisma: {} }, "../prisma": { prisma }, "../locales": { SUPPORTED_LOCALES }, "../audit-log": { writeAuditLog: async () => {} }, "../templates/donation-money": money, "./notification-template-upgrade": upgrades };
  const js = ts.transpileModule(readFileSync("lib/communication/notification-template-upgrade-service.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(js).runInNewContext({ module: mod, exports: mod.exports, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return { api: mod.exports, target: () => triggerTarget, writes: () => writes, created: () => createdData };
}
test("actual staging service dry-run cannot mutate templates, triggers or call a provider", async () => {
  const f = serviceFixture();
  const plan = await f.api.prepareNotificationUpgrades();
  assert.equal(plan.results[0].state, "WOULD_CREATE");
  assert.equal(f.writes(), 0); assert.equal(f.target(), "source");
  await assert.rejects(() => f.api.prepareNotificationUpgrades({ publish: true }), /requires apply/);
});
test("actual activation only switches fully approved, unchanged drafts on the unique default WABA", async () => {
  for (const options of [{ pending: true }, { changed: true }, { duplicateDefault: true }]) {
    const f = serviceFixture(options);
    await f.api.activateApprovedNotificationUpgrades();
    assert.equal(f.target(), "source"); assert.equal(f.writes(), 0);
  }
  const f = serviceFixture();
  const activated = await f.api.activateApprovedNotificationUpgrades();
  assert.equal(activated.results[0].state, "ACTIVATED"); assert.equal(f.target(), "replacement");
});

test("the registration successor starts as MARKETING with a localized stop button in every language", async () => {
  const f = serviceFixture({ welcome: true });
  await f.api.prepareNotificationUpgrades({ apply: true });
  const created = f.created()!;
  assert.equal(created.category, "MARKETING"); assert.equal(created.purpose, "MARKETING");
  assert.equal((created.notificationUpgrade as { version: number }).version, 3);
  const translations = created.translations as Record<string, { body: string; buttons: Array<{ text: string }> }>;
  for (const locale of SUPPORTED_LOCALES) {
    assert.equal(hasWhatsappUnsubscribeQuickReply(translations[locale].buttons), true, locale);
    assert.equal(translations[locale].buttons.at(-1)?.text, whatsappUnsubscribeCopy(locale).button);
    assert.ok(translations[locale].body.endsWith(whatsappUnsubscribeCopy(locale).footer));
  }
  assert.equal(f.target(), "source", "staging never switches an active trigger");
});

test("welcome activation requires all exact schemas approved as MARKETING", async () => {
  for (const options of [{ welcome: true, pending: true }, { welcome: true, wrongCategory: true }, { welcome: true, changed: true }]) {
    const f = serviceFixture(options); await f.api.activateApprovedNotificationUpgrades(); assert.equal(f.target(), "source"); assert.equal(f.writes(), 0);
  }
  const f = serviceFixture({ welcome: true });
  assert.equal((await f.api.activateApprovedNotificationUpgrades()).results[0].state, "ACTIVATED");
  assert.equal(f.target(), "replacement");
});

test("a mixed welcome and financial trigger cannot be reclassified as marketing automatically", async () => {
  const f = serviceFixture({ welcome: true, mixedWelcome: true });
  assert.equal((await f.api.prepareNotificationUpgrades({ apply: true })).results[0].state, "REVIEW_REQUIRED");
  assert.equal(f.writes(), 0); assert.equal(f.target(), "source");
});

test("actual email, SMS and WhatsApp helpers archive language refusals before any provider call", async () => {
  let providerCalls = 0;
  const statuses: string[] = [];
  const archived: Array<Record<string, unknown>> = [];
  const deps: Record<string, unknown> = {
    "./delivery-log-service": { createDeliveryRecord: async (row: Record<string, unknown>) => { archived.push(row); return { ok: true, data: { id: "attempt" } }; }, markDeliveryStatus: async (_id: string, status: string) => { statuses.push(status); } },
    "./provider-router": { sendPreparedDelivery: async () => { providerCalls++; throw new Error("must not send"); } },
    "./providers/email/client": { EMAIL_PROVIDER_ID: "ELASTIC_EMAIL" },
    "@/lib/messaging/log-sent": { logSentMessage: async () => {} },
  };
  const js = ts.transpileModule(readFileSync("lib/communication/automatic-message-dispatcher.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} as Record<string, (input: unknown) => Promise<{ outcome: string; reason: string }>> };
  new vm.Script(js).runInNewContext({ module: mod, exports: mod.exports, require: (name: string) => deps[name] ?? {} });
  const input = { renderingError: "EXACT_TEMPLATE_LANGUAGE_REQUIRED", triggerEvent: "DONATION_PAID", templateId: "template", templateName: "Receipt", locale: "tr", recipientUserId: "donor", recipientName: "Supporter", recipientEmail: "supporter@example.test", recipientPhone: "+905551112233", renderedBody: "wrong-language fixture", renderedSubject: "Receipt", variables: {}, sender: { id: "default" } };
  for (const method of ["sendAutomaticEmailMessage", "sendAutomaticSmsMessage", "sendAutomaticWhatsappMessage"]) {
    const result = await mod.exports[method](input);
    assert.equal(result.outcome, "SKIPPED"); assert.equal(result.reason, "EXACT_TEMPLATE_LANGUAGE_REQUIRED");
  }
  assert.equal(providerCalls, 0); assert.equal(archived.length, 3); assert.deepEqual(statuses, ["SKIPPED", "SKIPPED", "SKIPPED"]);
});
