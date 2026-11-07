import test from "node:test";
import assert from "node:assert/strict";
import { translateItem, translateToLocales, TRANSLATION_TARGET_LOCALES } from "../../lib/content-localization/translate";
import { missingProtectedTokens } from "../../lib/content-localization/protected-tokens";

/** All provider requests are intercepted: no network, production data or credentials. */
async function withProvider(
  reply: (locale: string, body: Record<string, unknown>) => unknown,
  fn: () => Promise<void>,
) {
  const original = globalThis.fetch;
  const apiKey = process.env.OPENAI_API_KEY;
  const database = process.env.DATABASE_URL;
  process.env.OPENAI_API_KEY = "fixture-only";
  delete process.env.DATABASE_URL;
  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
      const prompt = body.messages[1].content;
      const locale = /Translate from Arabic to [^(]+\(([^)]+)\)/u.exec(prompt)?.[1] ?? "unknown";
      const payload = reply(locale, body as unknown as Record<string, unknown>);
      if (payload instanceof Error) throw payload;
      return Response.json({ choices: [{ message: { content: JSON.stringify(payload) } }] });
    };
    await fn();
  } finally {
    globalThis.fetch = original;
    if (apiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = apiKey;
    if (database === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = database;
  }
}

test("the canonical Arabic source has eighteen distinct target locales", () => {
  assert.equal(TRANSLATION_TARGET_LOCALES.length, 18);
  assert.equal(new Set(TRANSLATION_TARGET_LOCALES).size, 18);
  assert.ok(!TRANSLATION_TARGET_LOCALES.includes("ar"));
});

test("batch retains successful locales but never offers incomplete fields for merging", async () => {
  await withProvider((locale) => locale === "fr"
    ? { fields: { title: "Projet" } }
    : { fields: { title: "Project", description: "Help families" } }, async () => {
    const out = await translateToLocales({
      fields: { title: "مشروع", description: "ساعد الأسر" },
    }, ["en", "fr"], 2);
    assert.deepEqual(Object.keys(out.translations), ["en"]);
    assert.equal(out.translations.en.fields.title, "Project");
    assert.equal(out.translations.fr, undefined);
    assert.match(out.errors.fr, /description/);
    assert.ok(out.warnings.fr.some(warning => warning.includes("description")));
  });
});

test("batch warns about repeat targets, rejects invalid locales and respects Arabic master", async () => {
  await withProvider(() => ({ fields: { title: "Families" } }), async () => {
    const out = await translateToLocales({ fields: { title: "الأسر" } }, ["en", "en", "ar", "invalid"], 2);
    assert.deepEqual(Object.keys(out.translations), ["en"]);
    assert.match(out.errors.ar, /لغة/);
    assert.match(out.errors.invalid, /لغة/);
    assert.match(out.warnings.en.join(" "), /المكرر/);
  });
});

test("misaligned rich text does not silently pass a batch or damage its structure", async () => {
  const doc = JSON.stringify({ type: "doc", content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "الأسر" }] },
    { type: "paragraph", content: [{ type: "text", marks: [{ type: "bold" }], text: "ساعد 15 أسرة" }] },
  ] });
  await withProvider(() => ({ fields: { title: "Support" }, richTexts: { body: ["Only one node"] } }), async () => {
    const out = await translateToLocales({
      fields: { title: "دعم" }, richFields: { body: doc },
    }, ["en"]);
    assert.equal(out.translations.en, undefined);
    assert.match(out.errors.en, /body/);
    assert.match(out.warnings.en.join(" "), /body/);
  });
});

test("protected amounts and Qur'anic quotations cannot be changed", () => {
  const source = "ساهم بـ ١٥ USD في ﴿إِنَّ مَعَ الْعُسْرِ يُسْرًا﴾";
  const valid = "Help with 15 USD for ﴿إِنَّ مَعَ الْعُسْرِ يُسْرًا﴾";
  assert.deepEqual(missingProtectedTokens(source, valid), []);
  assert.ok(missingProtectedTokens(source, valid.replace("15", "99")).length);
  assert.ok(missingProtectedTokens(source, valid.replace("يُسْرًا", "فرجًا")).length);
});

test("legal translations remain proposals with a human-review warning", async () => {
  await withProvider(() => ({ fields: { title: "Legal document" } }), async () => {
    const out = await translateItem({ fields: { title: "وثيقة قانونية" }, policy: "LEGAL_REVIEW_REQUIRED" }, "en");
    assert.equal(out.fields.title, "Legal document");
    assert.match(out.warnings.join(" "), /مراجعة واعتماد/);
  });
});

test("unsupported locales are rejected before contacting AI", async () => {
  await withProvider(() => { throw new Error("Model must not be called"); }, async () => {
    await assert.rejects(translateItem({ fields: { title: "دعم" } }, "xx"), /Unsupported translation locale/);
  });
});

test("empty rich documents and image-only documents are retained without an AI request", async () => {
  const doc = JSON.stringify({ type: "doc", content: [{ type: "image", attrs: { src: "/campaign.jpg" } }] });
  await withProvider(() => { throw new Error("No translatable text; do not call the model"); }, async () => {
    const output = await translateToLocales({ fields: {}, richFields: { body: doc } }, ["en", "fr"]);
    assert.deepEqual(Object.keys(output.errors), []);
    assert.equal(output.translations.en.richFields.body, doc);
    assert.equal(output.translations.fr.richFields.body, doc);
  });
});
