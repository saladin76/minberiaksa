import test from "node:test";
import assert from "node:assert/strict";
import { faqTranslationFields, translatedFaq } from "../../lib/content-editor/faq";

test("FAQ translations retain order and each question's structured data setting", () => {
  const original = JSON.stringify([{ q: "سؤال أول", a: "جواب أول", structuredData: false }, { q: "سؤال ثان", a: "جواب ثان" }]);
  const fields = faqTranslationFields(original);
  assert.equal(Object.keys(fields).length, 4);
  const translated = translatedFaq(original, { __faq_0_q: "First?", __faq_0_a: "First.", __faq_1_q: "Second?", __faq_1_a: "Second." });
  assert.deepEqual(JSON.parse(translated!), [{ q: "First?", a: "First.", structuredData: false }, { q: "Second?", a: "Second." }]);
});
test("a partial FAQ translation never overwrites a complete existing FAQ", () => {
  assert.equal(translatedFaq('[{"q":"Question","a":"Answer"}]', { __faq_0_q: "سؤال" }), null);
  assert.deepEqual(faqTranslationFields("invalid"), {});
});
