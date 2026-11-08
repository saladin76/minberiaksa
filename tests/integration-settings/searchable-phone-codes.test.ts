import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

type SearchModule = {
  normalizeCountrySearch: (query: string) => string;
  matchesDialCodeCountry: (country: { name: string; iso2: string; dialCode: string }, query: string, translated?: string) => boolean;
};

function searchHelpers(): SearchModule {
  // Exercise the exact production helper functions without mounting React.
  const source = readFileSync("components/SearchablePhoneInput.tsx", "utf8");
  const start = source.indexOf("export function normalizeCountrySearch(");
  const end = source.indexOf("/**\n * Preserves react-international-phone", start);
  assert.ok(start >= 0 && end > start);
  const javascript = ts.transpileModule(source.slice(start, end), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const sandboxModule = { exports: {} as SearchModule };
  new vm.Script(javascript).runInNewContext({ module: sandboxModule, exports: sandboxModule.exports });
  return sandboxModule.exports;
}

test("search finds countries using dial code with plus, localized digits and country ISO", () => {
  const { matchesDialCodeCountry: matches } = searchHelpers();
  const sa = { name: "Saudi Arabia", iso2: "sa", dialCode: "966" };
  const tr = { name: "Turkey", iso2: "tr", dialCode: "90" };
  assert.ok(matches(sa, "+966", "السعودية"));
  assert.ok(matches(sa, "٩٦٦", "السعودية"));
  assert.ok(matches(sa, "۹۶۶", "السعودية"));
  assert.ok(matches(sa, "السعودية", "السعودية"));
  assert.ok(matches(sa, "Saudi", "السعودية"));
  assert.ok(matches(tr, "TR", "Türkiye"));
  assert.ok(matches(tr, "turkiye", "Türkiye"));
  assert.ok(matches(tr, "+90", "Türkiye"));
  assert.ok(!matches(tr, "+966", "Türkiye"));
  assert.ok(!matches(sa, "Germany", "السعودية"));
});

test("search normalization keeps numeric and Arabic input usable", () => {
  const { normalizeCountrySearch: normalize } = searchHelpers();
  assert.equal(normalize("  +٩٠ "), "+90");
  assert.equal(normalize("+۹۶۶"), "+966");
  assert.equal(normalize("Türkiye"), "turkiye");
});

test("all five checkout and onboarding phone inputs use one searchable picker", () => {
  for (const path of [
    "components/SignInDialog.tsx",
    "components/DonationDialog.tsx",
    "components/CartPaymentDialog.tsx",
    "app/[locale]/auth/complete-profile/page.tsx",
    "components/minbar/checkout/CheckoutPage.tsx",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /import SearchablePhoneInput from "@\/components\/SearchablePhoneInput"/);
    assert.match(source, /<SearchablePhoneInput locale=\{locale\}/);
    assert.doesNotMatch(source, /<PhoneInput\b/);
  }
  const component = readFileSync("components/SearchablePhoneInput.tsx", "utf8");
  assert.match(component, /setCountry\(iso2,/);
  assert.match(component, /onChange=\{/); // search changes local query, not the donor's phone number
  assert.match(component, /role="listbox"/);
  assert.match(component, /role="combobox"/);
});
