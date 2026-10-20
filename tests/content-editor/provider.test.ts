import { test } from "node:test";
import assert from "node:assert/strict";
import { translateItem } from "../../lib/content-localization/translate";

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
