import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";
import { SUPPORTED_LOCALES } from "../../lib/locales";

type Localizer = (content: string, locale: string) => string;
const source = readFileSync("lib/templates/localize-donation-failure-link.ts", "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} as Record<string, unknown> };
new vm.Script(output).runInNewContext({
  module: loaded,
  exports: loaded.exports,
  require: (id: string) => {
    if (id !== "@/lib/locales") throw new Error(`Unexpected dependency: ${id}`);
    return {
      SUPPORTED_LOCALES,
      isValidLocale: (locale: string) => SUPPORTED_LOCALES.includes(locale as never),
    };
  },
});
const localize = loaded.exports.localizeDonationFailureLinks as Localizer;

test("donation-failure template links follow each supported recipient language", () => {
  for (const locale of SUPPORTED_LOCALES) {
    assert.equal(
      localize("https://minberiaksa.org/ar/donation-failed?donationId=abc#help", locale),
      `https://minberiaksa.org/${locale}/donation-failed?donationId=abc#help`,
    );
    assert.equal(
      localize("<a href='/ar/donation-failed'>retry</a>", locale),
      `<a href='/${locale}/donation-failed'>retry</a>`,
    );
  }
});

test("failure-link localization leaves external links and unrelated routes alone", () => {
  const input = "https://example.com/ar/donation-failed /ar/donation-failed-extra /ar/success";
  assert.equal(localize(input, "en"), input);
  assert.equal(localize("/ar/donation-failed", "not-a-locale"), "/ar/donation-failed");
});

test("trigger and campaign template renderers localize stored body links", () => {
  const compat = readFileSync("lib/communication/template-compat.ts", "utf8");
  const dispatch = readFileSync("lib/events/dispatch.ts", "utf8");
  const retry = readFileSync("lib/communication/delivery-retry-service.ts", "utf8");
  assert.match(compat, /localizeDonationFailureLinks\(ctx \? mergeText\(variant\.body, ctx\) : preview\.rendered, locale\)/);
  assert.match(compat, /localizeDonationFailureLinks\([\s\S]*renderEmailHtml\([\s\S]*locale/);
  assert.match(dispatch, /localizeDonationFailureLinks\([\s\S]*renderEmailHtml\([\s\S]*locale/);
  assert.equal((dispatch.match(/localizeDonationFailureLinks\(mergeText\(donationNotificationText\(variant\.body, (?:moneyContext, locale|legacyMoney)\), ctx\), locale\)/g) ?? []).length, 2);
  assert.match(retry, /localizeDonationFailureLinks\(row\.renderedBody, row\.locale \|\| "ar"\)/);
});

test("authored body and static Meta URL buttons use the same language in every locale", () => {
  const normalize = loaded.exports.localizeDonationFailureDraft as <T extends { body: string; buttons: Array<{ url?: string; text: string }> }>(value: T, locale: string) => T;
  for (const locale of SUPPORTED_LOCALES) {
    const original = {
      body: "Retry https://minberiaksa.org/ar/donation-failed?donationId={{donation.id}}",
      buttons: [
        { text: "Retry", url: "https://minberiaksa.org/ar/donation-failed?token={{token}}" },
        { text: "Contact", url: "https://example.org/ar/contact" },
      ],
    };
    const value = normalize(original, locale);
    assert.equal(value.body, `Retry https://minberiaksa.org/${locale}/donation-failed?donationId={{donation.id}}`);
    assert.equal(value.buttons[0].url, `https://minberiaksa.org/${locale}/donation-failed?token={{token}}`);
    assert.equal(value.buttons[1].url, original.buttons[1].url);
    assert.equal(original.buttons[0].url, "https://minberiaksa.org/ar/donation-failed?token={{token}}");
  }
});
