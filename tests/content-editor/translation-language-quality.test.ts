import test from "node:test";
import assert from "node:assert/strict";
import { translateItem, type TranslateInput } from "../../lib/content-localization/translate";
import { hasUnexpectedArabicProse } from "../../lib/content-localization/translation-language";

async function withModel<T>(replies: unknown[], run: (prompts: string[], models: string[]) => Promise<T>) {
  const original = globalThis.fetch, key = process.env.OPENAI_API_KEY, database = process.env.DATABASE_URL;
  const prompts: string[] = [];
  const models: string[] = [];
  process.env.OPENAI_API_KEY = "test-only-not-a-real-key"; delete process.env.DATABASE_URL;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(String(url), "https://api.openai.com/v1/chat/completions");
      prompts.push(JSON.parse(String(options?.body)).messages[1].content);
      models.push(JSON.parse(String(options?.body)).model);
      assert.ok(prompts.length <= replies.length, "Unexpected extra provider request");
      const reply = replies[prompts.length - 1];
      if (reply instanceof Error) throw reply;
      return Response.json({ choices: [{ message: { content: JSON.stringify(reply) } }] });
    };
    return await run(prompts, models);
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

test("every target locale receives Arabic-master audience guidance while rich headings, lists, marks and links stay fixed", async () => {
  const { TRANSLATION_TARGET_LOCALES } = await import("../../lib/content-localization/translate");
  const doc = { type: "doc", content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "ساعد الأسر" }] },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "دعم 15 أسرة", marks: [{ type: "bold" }, { type: "link", attrs: { href: "https://example.org/donate", target: "_blank" } }] }] }] }] },
    { type: "image", attrs: { src: "/families.jpg", alt: "صورة ثابتة" } },
  ] };
  for (const locale of TRANSLATION_TARGET_LOCALES) await withModel([{ fields: { title: "Family support" }, richTexts: { body: ["Support families", "Help 15 families"] } }], async prompts => {
    const result = await translateItem({ fields: { title: "دعم الأسر" }, richFields: { body: JSON.stringify(doc) } }, locale);
    assert.match(prompts[0], /Arabic is the authoritative master copy/);
    assert.match(prompts[0], /native readers/); assert.match(prompts[0], /search terms/);
    assert.match(prompts[0], /دعم الأسر/); assert.equal(result.warnings.length, 0);
    const expected = JSON.parse(JSON.stringify(doc).replace("ساعد الأسر", "Support families").replace("دعم 15 أسرة", "Help 15 families"));
    assert.deepEqual(JSON.parse(result.richFields.body), expected);
  });
});

test("plain paragraphs and HTML retain structure; flattened or modified proposals are refused without losing valid fields", async () => {
  for (const invalid of [false, true]) await withModel([{ fields: { title: "Support", body: invalid ? "Support families now" : "## Support\n\nHelp families\n- Donate", html: invalid ? '<p>Help families</p>' : '<h2>Support</h2><p><a href="https://example.org/?a=1&gt;0">Help families</a></p>' } }], async () => {
    const result = await translateItem({ fields: { title: "دعم", body: "## دعم\n\nساعد الأسر\n- تبرع" }, richFields: { html: '<h2>دعم</h2><p><a href="https://example.org/?a=1&gt;0">ساعد الأسر</a></p>' } }, "en");
    assert.equal(result.fields.title, "Support");
    if (invalid) { assert.equal(result.fields.body, undefined); assert.equal(result.richFields.html, undefined); assert.equal(result.warnings.length, 2); }
    else { assert.match(result.fields.body, /^## Support\n\n/); assert.match(result.richFields.html, /^<h2>Support/); assert.equal(result.warnings.length, 0); }
  });
});

test("translation refuses an intermediate source language before contacting the provider", async () => {
  await withModel([], async () => { await assert.rejects(translateItem({ fields: { title: "English intermediate" }, sourceLocale: "en" }, "fr"), /العربي الأصلي/); });
});

test("translation keeps word separators around bold and linked fragments and refuses blank replacement nodes", async () => {
  const doc = {type:"doc",content:[{type:"paragraph",content:[
    {type:"text",text:"ساعد "},{type:"text",text:"الأسر",marks:[{type:"bold"}]},{type:"text",text:" الآن"},
  ]}]};
  await withModel([{richTexts:{body:["Support","families","now"]}}],async()=>{
    const result=await translateItem({fields:{},richFields:{body:JSON.stringify(doc)}},"en");
    const saved=JSON.parse(result.richFields.body);
    assert.equal(saved.content[0].content.map((node:{text:string})=>node.text).join(""),"Support families now");
    assert.deepEqual(saved.content[0].content[1].marks,[{type:"bold"}]);
  });
  await withModel([{richTexts:{body:["Support","","now"]}}],async()=>{
    const result=await translateItem({fields:{},richFields:{body:JSON.stringify(doc)}},"en");
    assert.equal(result.richFields.body,undefined); assert.match(result.warnings.join(" "),/حُذفت/);
  });
});

test("ordinary editor translation respects the professional translation model override", async () => {
  const previous = process.env.CONTENT_PRO_TRANSLATION_MODEL;
  process.env.CONTENT_PRO_TRANSLATION_MODEL = "gpt-4.1";
  try {
    await withModel([{fields:{title:"Food parcels"}}],async(prompts,models)=>{
      const result=await translateItem({fields:{title:"طرود غذائية"}},"en");
      assert.equal(result.fields.title,"Food parcels"); assert.deepEqual(models,["gpt-4.1"]);
      assert.match(prompts[0],/idiomatic fundraising copy/);
    });
  } finally { if (previous === undefined) delete process.env.CONTENT_PRO_TRANSLATION_MODEL; else process.env.CONTENT_PRO_TRANSLATION_MODEL=previous; }
});
