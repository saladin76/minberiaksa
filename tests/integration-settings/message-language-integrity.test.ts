import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as locales from "../../lib/locales";
import { greetingTemplateDraft, greetingTemplateMatches } from "../../lib/communication/greeting-template-draft";
import { buildStandardMetaComponents, variableOrder } from "../../lib/communication/meta-template-components";
import { whatsappUnsubscribeCopy, isWhatsappUnsubscribeQuickReply } from "../../lib/communication/whatsapp-template-unsubscribe";
function load<T>(file: string, dependencies: Record<string, unknown>): T {
  const loaded = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(source, { filename: file }).runInNewContext({ module: loaded, exports: loaded.exports,
    require: (id: string) => { assert.ok(id in dependencies, id); return dependencies[id]; } });
  return loaded.exports as T;
}
test("all 19 greeting variants have one donor parameter, a localized brand and a working localized stop control", () => {
  const draft = greetingTemplateDraft(), bodies = new Set<string>(), footers = new Set<string>();
  assert.deepEqual(Object.keys(draft.translations), [...locales.SUPPORTED_LOCALES]);
  assert.equal(greetingTemplateDraft().name, draft.name);
  for (const locale of locales.SUPPORTED_LOCALES) {
    const variant = draft.translations[locale];
    assert.deepEqual(variableOrder(variant.body), ["user.name"]);
    assert.ok(variant.body.length < 1024); assert.ok(variant.footerText.length <= 60);
    assert.ok(variant.buttons[0].text.length <= 25);
    assert.equal(isWhatsappUnsubscribeQuickReply(variant.buttons[0].text), true, locale);
    assert.deepEqual(whatsappUnsubscribeCopy(`${locale.toUpperCase()}_XX`), whatsappUnsubscribeCopy(locale));
    const built = buildStandardMetaComponents({ ...variant, header: {}, headerText: "" });
    assert.equal(built.parameterFormat, "named"); assert.equal(built.bindings.length, 1);
    bodies.add(variant.body); footers.add(variant.footerText);
  }
  assert.equal(bodies.size, 19); assert.equal(footers.size, 19);
});
test("greeting setup is stable across database key order but refuses changed locale text or buttons", () => {
  const draft = greetingTemplateDraft();
  const reversed = Object.fromEntries(Object.entries(draft.translations).reverse().map(([locale, value]) => [locale, { buttons: value.buttons, footerText: value.footerText, body: value.body }]));
  assert.equal(greetingTemplateMatches({ ...draft, translations: reversed }), true);
  assert.equal(greetingTemplateMatches({ ...draft, buttons: [] }), false);
  reversed.fr.body += " changed"; assert.equal(greetingTemplateMatches({ ...draft, translations: reversed }), false);
});
test("a partially translated email never combines another language's subject and body", () => {
  const resolver = load<{ resolveEmailVariant: (template: unknown, locale: string, fallback?: string) => { subject: string; document: unknown; resolvedLocale: string }; resolveWhatsappBody: (template: unknown, locale: string, fallback?: string) => { body: string; resolvedLocale: string } }>("lib/templates/locale-resolver.ts", { "@/lib/locales": locales });
  const ar = { root: "Arabic" }, fr = { root: "French" };
  for (const partial of [{ subject: "Français" }, { document: fr }, { subject: " ", document: fr }]) {
    const result = resolver.resolveEmailVariant({ subject: "Arabic", document: ar, translations: { fr: partial } }, "fr");
    assert.equal(result.resolvedLocale, "ar"); assert.equal(result.document, ar); assert.equal(result.subject, "Arabic");
  }
  const translated = resolver.resolveEmailVariant({ subject: "Arabic", document: ar, translations: { fr: { subject: "Français", document: fr } } }, "fr");
  assert.equal(translated.resolvedLocale, "fr"); assert.equal(translated.document, fr);
  assert.equal(resolver.resolveEmailVariant({ subject: "Arabic", document: ar, translations: { en: { subject: "English", document: {} } } }, "ar", "en").resolvedLocale, "ar");
  assert.equal(resolver.resolveWhatsappBody({ body: "Arabic", translations: { en: { body: "English" } } }, "ar", "en").resolvedLocale, "ar");
});
test("coverage and campaign approval refuse implicit or historic fallback, while explicit exclusions remain valid", async () => {
  const coverage = load<{ computeLanguageCoverage: (counts: Record<string, number>, available: string[]) => { missingWithRecipients: Array<{ locale: string }>; canSendWithoutDecision: boolean } }>("lib/communication/language-coverage.ts", { "@/lib/locales": locales });
  const result = coverage.computeLanguageCoverage({ fr: 3, en: 2 }, ["en", "ar"]);
  assert.equal(result.canSendWithoutDecision, false); assert.equal(result.missingWithRecipients[0].locale, "fr");
  let decision = "FALLBACK";
  const gate = load<{ evaluateCoverageGate: (id: string, counts: Record<string, number>) => Promise<{ ok: boolean; undecided: string[] }> }>("lib/communication/campaign-approval-service.ts", {
    "@/lib/prisma": { prisma: { communicationCampaign: { findUnique: async () => ({ channel: "EMAIL", templateGroupId: "template", metadata: { coverageDecisions: { fr: decision } } }) } } },
    "./campaign-service": {}, "./campaign-recipient-service": {}, "./template-compat": { getTemplateAvailableLocales: async () => ["en", "ar"] },
    "./language-coverage": coverage, "./communication-runtime-types": { isCommunicationChannel: () => true },
  });
  assert.equal((await gate.evaluateCoverageGate("campaign", { fr: 3 })).ok, false);
  decision = "EXCLUDE"; assert.equal((await gate.evaluateCoverageGate("campaign", { fr: 3 })).ok, true);
});
