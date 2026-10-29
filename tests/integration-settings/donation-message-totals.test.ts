import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { SUPPORTED_LOCALES } from "../../lib/locales";
import { donationMoneyFields, DONATION_MONEY_LABELS, donationNotificationText, donationNotificationDocument, donationNotificationParameters } from "../../lib/templates/donation-money";
import { buildMetaComponents } from "../../lib/communication/providers/meta-whatsapp/parameters";
import { metaParameterName } from "../../lib/communication/meta-parameter-name";
import * as money from "../../lib/templates/money";
import * as donationMoney from "../../lib/templates/donation-money";
import * as projects from "../../lib/templates/donation-projects";

const order = { amount: 250, teamSupport: 50, fees: 0, totalAmount: 300, currency: "USD", paidAt: new Date("2026-10-26T10:00:00Z") };

test("all 19 locales show the stored total with project/support breakdown and distinguish unconfirmed attempts", () => {
  assert.deepEqual(Object.keys(DONATION_MONEY_LABELS).sort(), [...SUPPORTED_LOCALES].sort());
  for (const locale of SUPPORTED_LOCALES) {
    const labels = DONATION_MONEY_LABELS[locale];
    const paid = donationMoneyFields(order, locale);
    const failed = donationMoneyFields({ ...order, paidAt: null }, locale);
    assert.match(paid.amountBreakdown, /USD/);
    assert.ok(paid.amountBreakdown.startsWith(labels[3] + ":"));
    assert.ok(failed.amountBreakdown.startsWith(labels[4] + ":"));
    assert.ok(paid.amountBreakdown.includes(labels[0]) && paid.amountBreakdown.includes(labels[1]));
    assert.equal(paid.notificationAmount, money.formatTemplateMoney(order.totalAmount, locale, order.currency));
    assert.ok(!paid.notificationAmount.includes("\n"));
  }
  assert.equal(donationMoneyFields(order, "en").amountBreakdown, "Total: 300 USD (Projects: 250 USD; Team support: 50 USD)");
});

test("zero support, covered fees, fractions and zero-decimal currencies do not add support twice", () => {
  assert.equal(donationMoneyFields({ ...order, teamSupport: 0, totalAmount: 250 }, "en").notificationAmount, "250");
  const fields = donationMoneyFields({ ...order, amount: 10.25, teamSupport: 1.5, fees: 0.35, totalAmount: 12.1 }, "en");
  assert.equal(fields.notificationAmount, "12.1");
  // The saved order total is authoritative even for legacy records that do not add up.
  assert.ok(donationMoneyFields({ ...order, totalAmount: 299 }, "en").notificationAmount === "299");
  assert.ok(donationMoneyFields({ ...order, currency: "JPY" }, "en").notificationAmount === "300");
  assert.equal(donationMoneyFields({ ...order, totalAmount: NaN }, "en").notificationAmount, "");
  assert.equal(donationMoneyFields({ ...order, currency: "<img>" }, "en").notificationAmount, "");
});

test("legacy body values are upgraded without modifying URL/HTML attributes or explicit item/support fields", () => {
  const ctx = { donation: donationMoneyFields(order, "en") };
  const input = 'Amount {{donation.amount}} {{donation.currency}} <a href="/receipt?value={{donation.amount}}">receipt</a> https://example.org/?amount={{donation.totalAmount}} /receipt?amount={{donation.amount}}';
  const value = donationNotificationText(input, ctx);
  assert.ok(value.startsWith("Amount {{donation.receiptSummary}}"));
  assert.ok(value.includes('href="/receipt?value={{donation.amount}}"'));
  assert.ok(value.includes("https://example.org/?amount={{donation.totalAmount}}"));
  assert.ok(value.includes("/receipt?amount={{donation.amount}}"));
  const explicit = "{{donation.projectsAmount}} + {{donation.teamSupport}} = {{donation.totalAmount}}";
  assert.equal(donationNotificationText(explicit, ctx), explicit);
  assert.equal(donationNotificationText(input, {}), input);
});

test("email preparation clones the document and never rewrites button links", () => {
  const document = { root: { type: "EmailLayout", data: { childrenIds: ["text", "button"] } }, text: { type: "Text", data: { props: { text: "Amount: {{donation.amount}} USD" } } }, button: { type: "Button", data: { props: { text: "Donate", url: "/ar/checkout?amount={{donation.amount}}" } } } };
  const copy = donationNotificationDocument(document, { donation: donationMoneyFields(order, "en") });
  assert.equal(copy.text.data.props.text, "{{donation.receiptSummary}}");
  assert.equal(copy.button.data.props.url, document.button.data.props.url);
  assert.equal(document.text.data.props.text, "Amount: {{donation.amount}} USD");
});

for (const named of [false, true]) {
  test(`Meta ${named ? "named" : "positional"} body amount keeps the approved component count and preserves button/header scalar values`, () => {
    const slot = named ? metaParameterName("donation.amount") : "1";
    const schema = [{ type: "HEADER", format: "TEXT", text: `Reference {{${slot}}}` }, { type: "BODY", text: `Amount {{${slot}}} USD` }, { type: "BUTTONS", buttons: [{ type: "URL", text: "Donate", url: "https://example.org/donate?value={{1}}" }] }];
    const values = donationNotificationParameters({ values: { "1": "250", "donation.amount": "250", [slot]: "250" }, positionalNames: ["donation.amount"], scopedNames: { "header.1": "donation.amount", "body.1": "donation.amount", "button.0": "donation.amount" }, componentsSchema: schema, notificationAmount: donationMoneyFields(order, "en").notificationAmount });
    const built = buildMetaComponents({ componentsSchema: schema, values, positionalNames: ["donation.amount"], scopedNames: { "header.1": "donation.amount", "body.1": "donation.amount", "button.0": "donation.amount" } });
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.equal(built.components.length, 3);
    const text = (i: number) => (built.components[i].parameters[0] as { text: string }).text;
    assert.equal(text(0), "250");
    assert.equal(text(1), "300");
    assert.equal(text(2), "250");
  });
}

test("an explicit Meta breakdown keeps each numeric binding unchanged", () => {
  const values = { "donation.amount": "250", "donation.teamSupport": "50", "donation.totalAmount": "300" };
  assert.deepEqual(donationNotificationParameters({ values, scopedNames: { "body.1": "donation.amount", "body.2": "donation.teamSupport", "body.3": "donation.totalAmount" }, positionalNames: [], componentsSchema: [{ type: "BODY", text: "{{1}} + {{2}} = {{3}}" }], notificationAmount: "do not use" }), values);
});

test("the actual context loader reads support/fees/paid evidence and retains all project lines", async () => {
  let selection: Record<string, unknown> = {};
  const row = { ...order, id: "donation", donorId: "donor", locale: "en", status: "FAILED", paidAt: null, createdAt: new Date(), amountUSD: 250, items: [{ amount: 100, amountUSD: 100, campaign: { title: "Project A" } }, { amount: 150, amountUSD: 150, campaign: { title: "Project B" } }], categoryItems: [] };
  const prisma = { user: { findUnique: async () => ({ id: "donor", name: "Supporter", preferredLang: "en" }) }, donation: { findMany: async () => [], findUnique: async (input: { select: Record<string, unknown> }) => { selection = input.select; return row; } } };
  const mod = { exports: {} as { loadContextForDonation: (id: string) => Promise<{ donation: Record<string, unknown> }> } };
  const output = ts.transpileModule(readFileSync("lib/templates/variables.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(output).runInNewContext({ module: mod, exports: mod.exports, require: (id: string) => {
    if (id === "@/lib/prisma") return { prisma };
    if (id === "./money") return money;
    if (id === "./donation-money") return donationMoney;
    if (id === "./donation-projects") return projects;
    if (id === "./variable-catalog") return { VARIABLE_CATALOG: [] };
    throw new Error(`Unexpected dependency: ${id}`);
  } });
  const ctx = await mod.exports.loadContextForDonation("donation");
  assert.equal(selection.teamSupport, true);
  assert.equal(selection.fees, true);
  assert.equal(selection.paidAt, true);
  assert.equal(selection.provider, undefined);
  assert.equal(selection.providerOrderId, undefined);
  assert.equal(selection.providerRaw, undefined);
  assert.equal(ctx.donation.amount, "250");
  assert.equal(ctx.donation.totalAmount, "300");
  assert.equal(ctx.donation.teamSupport, "50");
  assert.equal(ctx.donation.itemCount, "2");
  assert.ok(String(ctx.donation.amountBreakdown).startsWith("Attempted total"));
  assert.equal(row.totalAmount, 300);
});

test("actual automatic email, SMS and Meta dispatch render the same attempted total without provider calls", async () => {
  const sent: Array<Record<string, unknown>> = [];
  const mergeText = (text: string, ctx: { donation: Record<string, string> }) => text.replace(/\{\{donation\.(\w+)\}\}/g, (_, name: string) => ctx.donation[name] ?? "");
  const body = "Amount: {{donation.amount}} {{donation.currency}}";
  const document = { text: { type: "Text", data: { props: { text: body } } } };
  const dependencies: Record<string, unknown> = {
    "@/lib/prisma": { prisma: { emailTemplate: { findUnique: async () => ({ id: "email", name: "email", document }) }, smsTemplate: { findUnique: async () => ({ id: "sms", name: "sms", body }) }, whatsappTemplate: { findUnique: async () => ({ id: "whatsapp", name: "whatsapp", body }) } } },
    "@/lib/templates/variables": { mergeText },
    "@/lib/templates/donation-money": donationMoney,
    "@/lib/templates/render": { renderEmailHtml: async (doc: typeof document, ctx: Parameters<typeof mergeText>[1]) => mergeText(doc.text.data.props.text, ctx), renderEmailSubject: () => "Notification" },
    "@/lib/templates/locale-resolver": { resolveEmailVariant: () => ({ document, subject: "Notification" }), resolveWhatsappBody: () => ({ body }) },
    "@/lib/templates/localize-donation-failure-link": { localizeDonationFailureLinks: (text: string) => text },
    "@/lib/communication/sender-resolution": { resolveSenderFromSnapshot: () => ({ ok: true, sender: { id: "sender", senderEmail: "sender@example.test", businessAccountId: "waba", phoneNumberId: "number" } }) },
    "@/lib/communication/automatic-message-dispatcher": {
      sendAutomaticEmailMessage: async (input: Record<string, unknown>) => { sent.push(input); return { outcome: "SENT" }; },
      sendAutomaticSmsMessage: async (input: Record<string, unknown>) => { sent.push(input); return { outcome: "SENT" }; },
      sendAutomaticWhatsappMessage: async (input: Record<string, unknown>) => { sent.push(input); return { outcome: "SENT" }; },
      resolveMetaTemplateMapping: async () => ({ positionalNames: ["donation.amount", "donation.currency"], scopedNames: { "body.1": "donation.amount", "body.2": "donation.currency" }, componentsSchema: [{ type: "BODY", text: "Amount: {{1}} {{2}}" }] }),
    },
  };
  const source = ts.transpileModule(readFileSync("lib/events/dispatch.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} as { sendTriggerMessage: (trigger: unknown, ctx: unknown, opts: unknown) => Promise<unknown> } };
  new vm.Script(source).runInNewContext({ module: mod, exports: mod.exports, require: (id: string) => {
    if (id === "@/lib/templates/font") return { automaticEmailHtml: (html: string) => html };
    if (id in dependencies) return dependencies[id];
    // These imports belong to the uninvoked claim/settlement helpers, not the renderer.
    if (["@vercel/analytics/server", "@/lib/audit-log", "@/lib/dashboard/audit-log-display", "@/lib/telegram/notify", "@/lib/tracking/donation-conversion-server", "@/lib/communication/donor-communication-profile-service", "@/lib/certificates/generate", "@/lib/certificates/issue", "@/lib/server-base-url"].includes(id)) return {};
    throw new Error(`Unexpected dependency: ${id}`);
  } });
  const ctx = { user: { id: "donor", name: "Supporter", email: "supporter@example.test", phone: "+15555555555" }, donation: { id: "donation", amount: "250", totalAmount: "300", currency: "USD", ...donationMoneyFields({ ...order, paidAt: null }, "en") } };
  for (const channel of ["EMAIL", "SMS", "WHATSAPP"]) await mod.exports.sendTriggerMessage({ channel, templateId: channel }, ctx, { event: "DONATION_FAILED", donationId: "donation", locale: "en", config: {} });
  assert.equal(sent.length, 3);
  for (const message of sent.slice(0, 2)) assert.equal(message.renderedBody, ctx.donation.receiptSummary);
  // An approved legacy Meta schema still uses a numeric body slot + currency.
  assert.equal(sent[2].renderedBody, "Amount: 300 USD");
  const values = sent[2].templateValues as Record<string, string>;
  assert.equal(values["body.1"], ctx.donation.notificationAmount);
  assert.equal(values["body.2"], undefined);
  assert.equal(values["donation.currency"], "USD");
  assert.equal(ctx.donation.amount, "250");
  assert.equal(ctx.donation.totalAmount, "300");
  // An unrelated marketing reminder is not silently converted into a receipt.
  await mod.exports.sendTriggerMessage({ channel: "SMS", templateId: "sms" }, ctx, { event: "DONATION_LAPSED", donationId: "donation", locale: "en", config: {} });
  assert.equal(sent[3].renderedBody, "Amount: 250 USD");
});
