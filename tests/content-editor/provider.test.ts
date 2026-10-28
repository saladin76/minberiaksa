import { before, after } from "node:test";
import { test } from "node:test";
import assert from "node:assert/strict";
import { translateItem } from "../../lib/content-localization/translate";

test("proofreading keeps the language, rich structure, links and protected amounts", async () => {
  const original = globalThis.fetch, key = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only-not-a-real-key";
  const doc = { type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "عنوان تجريبي" }] }, { type: "paragraph", content: [{ type: "text", marks: [{ type: "link", attrs: { href: "https://example.org/give" } }, { type: "bold" }], text: "ساعد 15 عائلة" }] }] };
  try {
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      assert.match(body.messages[0].content, /copy editor/);
      assert.match(body.messages[1].content, /SAME language/);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ fields: {}, richTexts: { description: ["عنوان تجريبي", "ساعد 15 عائلة."] } }) } }] }), { status: 200 });
    };
    const result = await translateItem({ mode: "proofread", sourceLocale: "ar", fields: {}, richFields: { description: JSON.stringify(doc) } }, "ar");
    const corrected = JSON.parse(result.richFields.description);
    assert.equal(corrected.content[1].content[0].text, "ساعد 15 عائلة.");
    const expected = structuredClone(doc); expected.content[1].content[0].text = "ساعد 15 عائلة.";
    assert.deepEqual(corrected, expected);
    assert.equal(result.warnings.length, 0);
  } finally {
    globalThis.fetch = original;
    if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key;
  }
});

test("translation calls the real adapter and preserves protected numbers and URLs", async () => {
  const original = globalThis.fetch,
    key = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only-not-a-real-key";
  let called = 0;
  try {
    globalThis.fetch = async (url, options) => {
      called++;
      assert.equal(String(url), "https://api.openai.com/v1/chat/completions");
      const body = JSON.parse(String(options?.body));
      assert.equal(body.response_format.type, "json_object");
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  fields: {
                    title: "Water for 15 families https://example.org/donate",
                    description: "Support 20 families",
                  },
                  richTexts: {},
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    };
    const result = await translateItem(
      {
        fields: {
          title: "ماء لـ 15 عائلة https://example.org/donate",
          description: "دعم 20 عائلة",
        },
      },
      "en",
    );
    assert.equal(called, 1);
    assert.equal(
      result.fields.title,
      "Water for 15 families https://example.org/donate",
    );
    assert.equal(result.fields.description, "Support 20 families");
  } finally {
    globalThis.fetch = original;
    if (key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = key;
  }
});
test("changed amounts are rejected by the adapter before a draft can apply them", async () => {
  const original = globalThis.fetch,
    key = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only-not-a-real-key";
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  fields: { title: "Help 99 families" },
                  richTexts: {},
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    const result = await translateItem(
      { fields: { title: "ساعد 15 عائلة" } },
      "en",
    );
    assert.equal(result.fields.title, undefined);
    assert.equal(result.warnings.length, 1);
  } finally {
    globalThis.fetch = original;
    if (key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = key;
  }
});
test("researched editor translation satisfies JSON mode using its input messages, not only top-level instructions", async () => {
  const original = globalThis.fetch, key = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only-not-a-real-key";
  let calls = 0;
  try {
    globalThis.fetch = async (url, options) => {
      calls++;
      assert.equal(String(url), "https://api.openai.com/v1/responses");
      const body = JSON.parse(String(options?.body));
      assert.equal(body.text.format.type, "json_object");
      // The API validates the input itself; JSON in `instructions` alone is insufficient.
      if (!/json/i.test(JSON.stringify(body.input))) return Response.json({ error: { type: "invalid_request_error", param: "input" } }, { status: 400 });
      assert.match(body.input, /ترميم منازل البلدة القديمة/);
      assert.equal(body.store, false);
      return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ fields: { title: "Restoring homes in the Old City" }, richTexts: {} }) }] }] });
    };
    const result = await translateItem({ fields: { title: "ترميم منازل البلدة القديمة" }, researchContext: "Use established architectural terminology." }, "en");
    assert.equal(calls, 1);
    assert.equal(result.fields.title, "Restoring homes in the Old City");
    assert.deepEqual(result.warnings, []);
  } finally {
    globalThis.fetch = original;
    if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key;
  }
});
test("oversized plain fields fail instead of silently translating only the beginning", async () => {
  await assert.rejects(
    translateItem({ fields: { title: "a".repeat(12001) } }, "en"),
    /أطول/,
  );
});
test("protected religious policy never calls the provider", async () => {
  const original = globalThis.fetch;
  let called = false;
  try {
    globalThis.fetch = async () => {
      called = true;
      throw new Error("must not call");
    };
    await assert.rejects(
      translateItem(
        { fields: { title: "آية" }, policy: "RELIGIOUS_LOCKED" },
        "en",
      ),
    );
    assert.equal(called, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("Quran text in ornamental brackets remains immutable", async () => {
  const { missingProtectedTokens } =
    await import("../../lib/content-localization/protected-tokens");
  assert.equal(
    missingProtectedTokens(
      "النص ﴿ إِنَّ مَعَ الْعُسْرِ يُسْرًا ﴾",
      "Text ﴿ إِنَّ مَعَ الْعُسْرِ يُسْرًا ﴾",
    ).length,
    0,
  );
  assert.ok(
    missingProtectedTokens(
      "النص ﴿ إِنَّ مَعَ الْعُسْرِ يُسْرًا ﴾",
      "Text indeed with hardship comes ease",
    ).length,
  );
});

const databaseUrlBeforeFixture = process.env.DATABASE_URL;
before(() => { delete process.env.DATABASE_URL; });
after(() => { if (databaseUrlBeforeFixture === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = databaseUrlBeforeFixture; });
