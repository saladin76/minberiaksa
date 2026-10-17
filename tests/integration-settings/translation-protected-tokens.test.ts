import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  missingProtectedTokens,
  normalizeDigits,
  protectedTokens,
  protectedTokensPreserved,
} from "../../lib/content-localization/protected-tokens";

const ok = (source: string, translated: string) =>
  assert.equal(protectedTokensPreserved(source, translated), true, `${source}  →  ${translated}: ${missingProtectedTokens(source, translated).join(", ")}`);
const rejected = (source: string, translated: string) =>
  assert.equal(protectedTokensPreserved(source, translated), false, `${source}  →  ${translated} should be rejected`);

test("Arabic-Indic and other native digits count as the same number", () => {
  assert.equal(normalizeDigits("١٢٣ ۴۵۶ ७८९ ０"), "123 456 789 0");
  ok("ساهم بـ ١٠٠ دولار", "Donate $100");
  ok("ساهم بـ 100 دولار", "100 روپے کا عطیہ کریں ۱۰۰");
  ok("بناء ٣ آبار", "Build 3 wells");
});

test("locale number formatting is not a change", () => {
  ok("الهدف 10,000 دولار", "Hedef 10.000 dolar");
  ok("الهدف 10,000 دولار", "Objectif 10 000 dollars");
  ok("الهدف 10,000 دولار", "Ziel 10.000 Dollar");
  ok("نسبة 50% من التبرعات", "Bağışların %50'si");
  ok("التبرع $100", "Don de 100 $");
  ok("2.5 كيلو", "2,5 kg");
});

test("a URL keeps its identity with or without a trailing full stop", () => {
  ok("زوروا https://minberiaksa.org/campaigns.", "Visit https://minberiaksa.org/campaigns");
  ok("راسلونا info@minberiaksa.org", "Write to INFO@minberiaksa.org");
});

test("placeholders, ICU variables, tags and currency codes must survive", () => {
  ok("مرحبا {{name}}، تبرعك {amount, number}", "Hello {{ name }}, your gift {amount, number}");
  ok("<b>مهم</b> USD", "<b>Important</b> usd");
  rejected("مرحبا {{name}}", "Hello {{nom}}");
  rejected("تبرعك {amount}", "Your gift");
  rejected("المبلغ USD", "The amount EUR");
  rejected("<b>مهم</b>", "important");
});

test("a changed or dropped number, link or email is still rejected", () => {
  rejected("الهدف 10,000 دولار", "Goal 1,000 dollars");
  rejected("ساهم بـ ١٠٠", "Donate 10");
  rejected("بناء 3 آبار و 5 مدارس", "Build 3 wells and schools");
  rejected("زوروا https://minberiaksa.org/a", "Visit https://minberiaksa.org/b");
  rejected("راسلونا info@minberiaksa.org", "Write to us");
});

test("a translation may add a number the source spelled in words", () => {
  ok("بناء ثلاثة آبار", "Build 3 wells");
});

test("digits inside links and placeholders are not counted twice", () => {
  assert.deepEqual(protectedTokens("https://x.org/p/2024 {{item_1}}"), ["url:https://x.org/p/2024", "var:{{item_1}}"]);
});

test("missing values are reported by value, for the warning", () => {
  assert.deepEqual(missingProtectedTokens("10,000 و https://a.org", "1,000"), ["10000", "https://a.org"]);
});

test("translate.ts uses the shared gate and checks rich documents as a whole", () => {
  const source = readFileSync("lib/content-localization/translate.ts", "utf8");
  assert.match(source, /from "\.\/protected-tokens"/);
  assert.match(source, /missingProtectedTokens\(lifted\.texts\.join\("\\n"\), translatedTexts\.join\("\\n"\)\)/);
  assert.doesNotMatch(source, /sameProtectedTokens|PROTECTED_LITERAL_RE/);
});
