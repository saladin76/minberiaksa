import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { economicalAiFetch } from "../../lib/ai/core/economical-fetch";
import { contentModels, researchRequest } from "../../lib/ai/core/content-requests";
import { encryptCard, decryptCard } from "../../lib/card-crypto";
const init = (body = "{}", key = "fixture-key") => ({ method: "POST", headers: { authorization: `Bearer ${key}` }, body });
test("identical complete AI requests share one provider call and a short memory result; credential and body changes never share results", async () => {
 let calls = 0; let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
 const fetcher: typeof fetch = async () => { calls++; await gate; return Response.json({ status: "completed", output_text: "fixture result" }); };
 const first = economicalAiFetch("https://fixture.invalid/responses", init(), fetcher), second = economicalAiFetch("https://fixture.invalid/responses", init(), fetcher); release();
 const replies = await Promise.all([first, second]); assert.equal(calls, 1); assert.deepEqual(await replies[0].json(), await replies[1].json());
 assert.equal((await economicalAiFetch("https://fixture.invalid/responses", init(), fetcher)).headers.get("x-ai-cache"), "HIT"); assert.equal(calls, 1);
 await economicalAiFetch("https://fixture.invalid/responses", init("{}", "other-key"), fetcher); await economicalAiFetch("https://fixture.invalid/responses", init('{"changed":true}'), fetcher); assert.equal(calls, 3);
});
test("AI errors and incomplete output are not cached, and an already cancelled request never contacts the provider", async () => {
 for (const payload of [{ error: "temporary" }, { status: "incomplete", output_text: "partial" }, { choices: [{ finish_reason: "length", message: { content: "partial" } }] }]) {
  let calls = 0; const fetcher: typeof fetch = async () => { calls++; return Response.json(payload); };
  await economicalAiFetch("https://fixture.invalid/responses", init(), fetcher); await economicalAiFetch("https://fixture.invalid/responses", init(), fetcher); assert.equal(calls, 2);
 }
 const c = new AbortController(); c.abort(); await assert.rejects(economicalAiFetch("https://fixture.invalid/responses", { ...init(), signal: c.signal }, async () => { throw new Error("must not call"); }));
 const models = contentModels({ NODE_ENV: "test", SEO_RESEARCH_MODEL: "research-override" }, "translation-override"); assert.equal(models.research, "research-override"); assert.equal(models.translation, "translation-override"); assert.equal(researchRequest("fixture", { NODE_ENV: "test" }).max_tool_calls, 2);
});
test("new saved cards use authenticated encryption and existing CBC cards remain readable without changing the key", () => {
 const old = process.env.CARD_ENCRYPTION_KEY; process.env.CARD_ENCRYPTION_KEY = "fixture-only-card-key";
 try {
  const plain = "4242424242424242", stored = encryptCard(plain); assert.match(stored, /^v2:/); assert.equal(decryptCard(stored), plain); assert.notEqual(encryptCard(plain), stored);
  const parts = stored.split(":"); parts[2] = (parts[2][0] === "a" ? "b" : "a") + parts[2].slice(1); assert.throws(() => decryptCard(parts.join(":")));
  const iv = crypto.randomBytes(16), key = crypto.createHash("sha256").update(process.env.CARD_ENCRYPTION_KEY).digest(), cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const legacy = iv.toString("hex") + ":" + Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]).toString("hex"); assert.equal(decryptCard(legacy), plain);
 } finally { if (old === undefined) delete process.env.CARD_ENCRYPTION_KEY; else process.env.CARD_ENCRYPTION_KEY = old; }
});
