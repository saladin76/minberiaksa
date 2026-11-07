import test from "node:test";
import assert from "node:assert/strict";
import { localizationQualityIssues } from "../../lib/content-localization/translation-quality";
import { missingProtectedTokens } from "../../lib/content-localization/protected-tokens";

test("read-only audit detects leaked prose and altered protected values independently", () => {
  const issues = localizationQualityIssues("description", "ساعد 15 أسرة عبر https://example.org/give", "Help 99 أسرة at https://example.org/give", "en");
  assert.deepEqual(issues.map(issue => issue.code).sort(), ["PROTECTED_VALUE_CHANGED", "SOURCE_LEAK"]);
});

test("source language detection excludes unchanged Quran text and never flags Urdu", () => {
  assert.deepEqual(localizationQualityIssues("body", "﴿وقولوا للناس حسنا﴾ أسرة", "Families ﴿وقولوا للناس حسنا﴾", "en"), []);
  assert.ok(!localizationQualityIssues("body", "مساعدة أسر", "خاندانوں کی مدد", "ur").some(issue => issue.code === "SOURCE_LEAK"));
});

test("Tiptap shape and image/link metadata remain intact", () => {
  const document = { type: "doc", content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "العنوان" }] },
    { type: "paragraph", content: [{ type: "text", marks: [{ type: "link", attrs: { href: "https://example.org" } }], text: "ساعد 15 أسرة" }] },
    { type: "image", attrs: { src: "/image.jpg", alt: "صورة ثابتة" } },
  ] };
  const translated = structuredClone(document);
  const heading = translated.content[0] as { content: Array<{ text: string }> };
  const paragraph = translated.content[1] as { content: Array<{ text: string; marks: Array<{ attrs: { href: string } }> }> };
  heading.content[0].text = "Heading";
  paragraph.content[0].text = "Help 15 families";
  assert.deepEqual(localizationQualityIssues("body", JSON.stringify(document), JSON.stringify(translated), "en"), []);
  // Images can have translated alt text without being treated as structural changes.
  (translated.content[2] as { attrs: { alt: string } }).attrs.alt = "A family receiving support";
  assert.deepEqual(localizationQualityIssues("body", JSON.stringify(document), JSON.stringify(translated), "en"), []);
  paragraph.content[0].marks[0].attrs.href = "https://other.example";
  assert.ok(localizationQualityIssues("body", JSON.stringify(document), JSON.stringify(translated), "en").some(issue => issue.code === "STRUCTURE_CHANGED"));
});

test("plain Markdown and HTML structure cannot silently flatten", () => {
  const issues = localizationQualityIssues("body", "## مساعدة\n\n- دعم", "Support", "en");
  assert.ok(issues.some(issue => issue.code === "STRUCTURE_CHANGED"));
});

test("Arabic, Thai, Myanmar and fullwidth digit blocks are normalized for immutable values", () => {
  for (const digits of ["١٥", "۱۵", "१५", "১৫", "１５", "๑๕", "၁၅"]) {
    assert.deepEqual(missingProtectedTokens(`ادعم ${digits} أسرة`, "Help 15 families"), [], digits);
  }
});

test("French narrow no-break grouping retains the integer value", () => {
  assert.deepEqual(missingProtectedTokens("تبرع 1,000 USD", "Donation 1\u202f000 USD"), []);
});


test("numeric QA distinguishes decimal changes, signs and percentages", () => {
  for (const [source, invalid] of [
    ["15 USD", "1.5 USD"],
    ["0.125 USD", "125 USD"],
    ["50%", "50"],
    ["%50", "60%"],
    ["-10 USD", "+10 USD"],
    ["15.75 USD", "15.57 USD"],
  ]) {
    assert.notDeepEqual(missingProtectedTokens(source, invalid), [], source + " -> " + invalid);
  }
});

test("locale numeric forms preserve true values and percentage order", () => {
  for (const [source, equivalent] of [
    ["50%", "%٥٠"],
    ["1,234.50 USD", "1.234,50 USD"],
    ["1.000 USD", "1 000 USD"],
    ["0.125 USD", "0,125 USD"],
    ["15.50 USD", "15,5 USD"],
    ["20,00 USD", "20 USD"],
  ]) {
    assert.deepEqual(missingProtectedTokens(source, equivalent), [], source + " -> " + equivalent);
  }
});

test("non-bracketed fixed religious symbols are protected", () => {
  assert.deepEqual(missingProtectedTokens("﷽ مشروع", "﷽ Project"), []);
  assert.notDeepEqual(missingProtectedTokens("﷽ مشروع", "Project"), []);
});
