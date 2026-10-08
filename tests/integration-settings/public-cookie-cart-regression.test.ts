import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { SUPPORTED_CURRENCY_OPTIONS } from "../../lib/supported-currencies";
import { SUPPORTED_LOCALES, localeDirection } from "../../lib/locales";

type Helpers = {
  getCurrencyCodeForLinks: () => string;
  appendCurrencyQuery: (href: string, currency: string) => string;
  mergeCurrencyIntoHref: (href: Record<string, unknown>, currency: string) => Record<string, unknown>;
};
function currencyHelpers(documentValue?: unknown): Helpers {
  const output = ts.transpileModule(fs.readFileSync("lib/currency-link.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new vm.Script(output, { filename: "lib/currency-link.ts" }).runInNewContext({
    module: loaded, exports: loaded.exports, URL, URLSearchParams,
    ...(documentValue === undefined ? {} : { document: documentValue }),
    require: (id: string) => { if (id !== "./supported-currencies") throw new Error(`Unexpected import: ${id}`); return { SUPPORTED_CURRENCY_OPTIONS }; },
  });
  return loaded.exports as Helpers;
}
for (const [cookie, expected] of [
  ["", "USD"], ["other=value", "USD"], ["currency=DEFAULT", "USD"],
  ["currency=eur", "EUR"], ["other=1; currency=TRY", "TRY"], ["currency=%20GBP%20", "GBP"],
  ["currency=%", "USD"], ["currency=%E0%A4%A", "USD"], ["currency=%ZZ", "USD"],
]) {
  test(`currency links tolerate cookie ${JSON.stringify(cookie)}`, () => {
    assert.equal(currencyHelpers({ cookie }).getCurrencyCodeForLinks(), expected);
  });
}
test("currency links remain renderable during server rendering and blocked cookie access", () => {
  assert.equal(currencyHelpers().getCurrencyCodeForLinks(), "USD");
  const blocked = Object.defineProperty({}, "cookie", { get() { throw new Error("cookie access denied"); } });
  assert.equal(currencyHelpers(blocked).getCurrencyCodeForLinks(), "USD");
});
test("currency links preserve path, query values, fragment and special contact schemes", () => {
  const helpers = currencyHelpers();
  assert.equal(helpers.appendCurrencyQuery("/ar/projects?q=test#donate", "EUR"), "/ar/projects?q=test&currency=EUR#donate");
  assert.equal(helpers.appendCurrencyQuery("/ar?currency=USD", "TRY"), "/ar?currency=TRY");
  assert.equal(helpers.appendCurrencyQuery("mailto:info@example.test", "EUR"), "mailto:info@example.test");
  assert.equal(helpers.appendCurrencyQuery("tel:+905551112233", "EUR"), "tel:+905551112233");
  const object = helpers.mergeCurrencyIntoHref({ pathname: "/projects", query: { page: 2 } }, "EUR");
  assert.equal((object.query as { page: number }).page, 2);
  assert.equal((object.query as { currency: string }).currency, "EUR");
});
test("cart direction uses the canonical locale reference without a narrowed language cast", () => {
  const source = fs.readFileSync("components/CartSheet.tsx", "utf8");
  assert.match(source, /localeDirection\(locale\) === ['"]rtl['"]/);
  assert.doesNotMatch(source, /const isRTL = locale === ['"]ar['"]/);
});
for (const locale of SUPPORTED_LOCALES) {
  test(`cart direction supports locale ${locale}`, () => {
    assert.equal(localeDirection(locale), locale === "ar" || locale === "ur" ? "rtl" : "ltr");
  });
}
