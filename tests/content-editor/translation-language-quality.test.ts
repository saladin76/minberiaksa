import test from "node:test";
import assert from "node:assert/strict";
import { translateItem, type TranslateInput } from "../../lib/content-localization/translate";
import { hasUnexpectedArabicProse } from "../../lib/content-localization/translation-language";

async function withModel<T>(replies: unknown[], run: (prompts: string[]) => Promise<T>) {
  const original = globalThis.fetch, key = process.env.OPENAI_API_KEY, database = process.env.DATABASE_URL;
  const prompts: string[] = [];
  process.env.OPENAI_API_KEY = "test-only-not-a-real-key"; delete process.env.DATABASE_URL;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(String(url), "https://api.openai.com/v1/chat/completions");
      prompts.push(JSON.parse(String(options?.body)).messages[1].content);
      assert.ok(prompts.length <= replies.length, "Unexpected extra provider request");
      const reply = replies[prompts.length - 1];
      if (reply instanceof Error) throw reply;
      return Response.json({ choices: [{ message: { content: JSON.stringify(reply) } }] });
    };
    return await run(prompts);
  } finally {
    globalThis.fetch = original;
    if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key;
    if (database === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = database;
  }
}

test("a real translation repairs only leftover Arabic fields once and preserves completed proposals", async () => {
  await withModel([{ fields: { title: "Restauro a Gerusalemme", intro: "La moschea al-Aqsa المبارك." } }, { fields: { intro: "La benedetta moschea di al-Aqsa." } }], async prompts => {
    const result = await translateItem({ fields: { title: "ترميم في القدس", intro: "المسجد الأقصى المبارك" } }, "it");
    assert.equal(prompts.length, 2); assert.doesNotMatch(prompts[1], /Restauro a Gerusalemme/);
    assert.equal(result.fields.title, "Restauro a Gerusalemme"); assert.equal(result.fields.intro, "La benedetta moschea di al-Aqsa."); assert.equal(result.warnings.length, 0);
  });
});

test("missing, failed or still-mixed repairs omit only the unresolved field with a visible warning", async () => {
  for (const repair of [{}, new Error("provider unavailable"), { fields: { intro: "Still contains المبارك" } }]) {
    await withModel([{ fields: { title: "Restoration", intro: "Al-Aqsa المبارك" } }, repair], async prompts => {
      const result = await translateItem({ fields: { title: "الترميم", intro: "الأقصى المبارك" } }, "en");
      assert.equal(prompts.length, 2); assert.equal(result.fields.title, "Restoration"); assert.equal(result.fields.intro, undefined); assert.match(result.warnings.join(" "), /intro/);
    });
  }
});

test("repair keeps rich formatting and still rejects a changed protected amount", async () => {
  const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "ساعد 15 عائلة", marks: [{ type: "bold" }] }] }] };
  for (const amount of ["15", "99"]) {
    await withModel([{ fields: { title: "Project" }, richTexts: { content: ["Help 15 عائلة"] } }, { richTexts: { content: [`Help ${amount} families`] } }], async prompts => {
      const result = await translateItem({ fields: { title: "مشروع" }, richFields: { content: JSON.stringify(doc) } }, "en");
      assert.equal(prompts.length, 2); assert.equal(result.fields.title, "Project");
      if (amount === "99") { assert.equal(result.richFields.content, undefined); assert.ok(result.warnings.length); }
      else { const expected = structuredClone(doc); expected.content[0].content[0].text = "Help 15 families"; assert.deepEqual(JSON.parse(result.richFields.content), expected); }
    });
  }
});

test("source verses, Urdu, Arabic, legal-review text and proofreading do not trigger an inappropriate language repair", async () => {
  const cases: { locale: string; input: TranslateInput; text: string }[] = [
    { locale: "en", input: { fields: { title: "آية ﴿وقولوا للناس حسنا﴾" } }, text: "Verse ﴿وقولوا للناس حسنا﴾" },
    { locale: "ur", input: { fields: { title: "مشروع" } }, text: "مسجد کی مرمت" },
    { locale: "ar", input: { fields: { title: "مشروع" } }, text: "مشروع خيري" },
    { locale: "tr", input: { fields: { title: "المؤسسة" }, policy: "LEGAL_REVIEW_REQUIRED" }, text: "المؤسسة" },
    { locale: "en", input: { fields: { title: "Registered مؤسسة" }, sourceLocale: "en", mode: "proofread" }, text: "Registered مؤسسة" },
  ];
  for (const item of cases) await withModel([{ fields: { title: item.text } }], async prompts => {
    const result = await translateItem(item.input, item.locale); assert.equal(prompts.length, 1); assert.equal(result.fields.title, item.text);
  });
});

test("the prose check preserves opaque tokens, URLs, source verses and Arabic digits but detects an untranslated ordinary word", () => {
  const source = "قال ﴿وقولوا للناس حسنا﴾ {{اسم}} https://example.org/عربي";
  assert.equal(hasUnexpectedArabicProse(source, "Verse ﴿وقولوا للناس حسنا﴾ {{اسم}} https://example.org/عربي ١٥"), false);
  assert.equal(hasUnexpectedArabicProse(source, "Al-Aqsa المبارك"), true);
});
