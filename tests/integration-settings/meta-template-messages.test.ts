import test from "node:test";
import assert from "node:assert/strict";
import { explainMetaTemplateError, metaTemplateFormatProblems } from "../../lib/communication/meta-template-messages";
const none = new Set<string>();

test("the two rejections seen on 20 Nov are caught before sending, in Arabic, naming the language", () => {
  const p = metaTemplateFormatProblems({
    fr: { body: "Bonjour\n\n\n🔁 Partagez", footerText: "", buttons: [{ type: "URL", text: "Faites un don maintena 🚨" }] },
    ar: { body: "عاجل\n\nنص", footerText: "", buttons: [{ type: "QUICK_REPLY", text: "إيقاف" }] },
  }, none);
  assert.ok(p.some((x) => x.includes("نسخة الفرنسية") && x.includes("إيموجي")));
  assert.ok(p.some((x) => x.includes("نسخة الفرنسية") && x.includes("سطر فارغ متتالٍ")));
  assert.ok(!p.some((x) => x.includes("نسخة العربية")), "a clean Arabic copy raises nothing");
});

test("other button rules: newline, formatting, variable, length; body emoji count; footer variable", () => {
  const p = metaTemplateFormatProblems({ en: { body: "😀😀😀😀😀😀😀😀😀😀😀", footerText: "{{user.name}}", buttons: [{ text: "a\nb" }, { text: "*Donate*" }, { text: "Hi {{1}}" }, { text: "x".repeat(26) }] } }, none);
  for (const k of ["سطراً جديداً", "رموز تنسيق", "متغيراً", "أطول من 25", "11 إيموجي", "التذييل"]) assert.ok(p.some((x) => x.includes(k)), k);
});

test("languages already approved by Meta are not re-checked", () => {
  assert.deepEqual(metaTemplateFormatProblems({ fr: { body: "a\n\n\nb", buttons: [] } }, new Set(["fr"])), []);
});

test("Meta's raw errors become Arabic explanations; unknown ones are left as they are", () => {
  assert.match(explainMetaTemplateError("400/100: Button format is incorrect · Buttons can't have any variables, newlines, emojis or formatting characters.") ?? "", /الأزرار|الزر/);
  assert.match(explainMetaTemplateError("Message body format is incorrect · The message body can't have more than two consecutive newline characters") ?? "", /سطر فارغ/);
  assert.match(explainMetaTemplateError("1077508008426130: network error") ?? "", /الاتصال بـMeta/);
  assert.equal(explainMetaTemplateError("something entirely new"), null);
});

import fs from "node:fs";
test("the studio checks before sending and explains Meta's rejection; dashboard errors stay until closed", () => {
  const studio = fs.readFileSync("app/(dashboard)/dashboard/templates/_components/WhatsappTemplateEditorDialog.tsx", "utf8");
  assert.match(studio, /const formatProblems = metaTemplateFormatProblems\(locales, submittedLocales\);/);
  assert.match(studio, /const explained = explainMetaTemplateError\(problem\);/);
  const layout = fs.readFileSync("app/(dashboard)/dashboard/DashboardLayoutClient.tsx", "utf8");
  assert.match(layout, /error: \{ duration: Infinity \}/);
  assert.match(layout, /onClick=\{\(\) => hotToast\.dismiss\(t\.id\)\}/);
});
