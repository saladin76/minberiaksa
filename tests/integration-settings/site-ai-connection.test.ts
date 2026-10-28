import test from "node:test";
import assert from "node:assert/strict";
import { AiConnectionConfig, type AiConnectionRecord, type AiConnectionStore } from "../../lib/ai/core/connection-config";

const storedKey = "sk-fixture-central-key-123456789";
const oldKey = "sk-fixture-environment-key-987654321";
function fixture(extra: Partial<NodeJS.ProcessEnv> = {}) {
  let row: AiConnectionRecord | null = null;
  let writes = 0;
  const store: AiConnectionStore = { read: async () => row, replace: async (expected, value) => { if ((row?.revision ?? null) !== expected) return false; row = value; writes++; return true; } };
  const env = { NODE_ENV: "test" as const, DATABASE_URL: "test-only", INTEGRATION_SETTINGS_ENCRYPTION_KEY: Buffer.alloc(32, 17).toString("base64"), OPENAI_API_KEY: oldKey, AI_CORE_ENABLE_EXTERNAL_CALLS: "true", ...extra };
  return { config: new AiConnectionConfig(store, env), env, store, row: () => row, writes: () => writes };
}
test("manual keys are encrypted and safe snapshots never contain secret values or envelopes", async () => {
  const h = fixture();
  const saved = await h.config.save({ revision: null, enabled: true, model: "gpt-4.1-mini", apiKey: storedKey });
  assert.equal(saved.source, "DATABASE"); assert.equal(saved.keyPresent, true);
  assert.doesNotMatch(JSON.stringify(saved), /sk-fixture|encryptedKey/);
  assert.ok(h.row()?.encryptedKey); assert.ok(!h.row()!.encryptedKey!.includes(storedKey));
  for (const purpose of ["core", "content"] as const) assert.equal((await h.config.runtime(purpose)).apiKey, storedKey);
  assert.equal(h.writes(), 1);
});
test("blank key preserves the effective key and captures server settings only on explicit save", async () => {
  const h = fixture();
  assert.equal((await h.config.snapshot()).source, "ENVIRONMENT"); assert.equal(h.writes(), 0);
  const first = await h.config.save({ revision: null, enabled: true, model: "gpt-4.1-mini", apiKey: " " });
  assert.equal((await h.config.runtime()).apiKey, oldKey);
  await h.config.save({ revision: first.revision, enabled: true, model: "gpt-4o-mini" });
  assert.equal((await h.config.runtime()).apiKey, oldKey); assert.equal((await h.config.runtime()).model, "gpt-4o-mini");
});
test("manual disable and explicit clear suppress every consumer even when a server key remains", async () => {
  const h = fixture();
  const disabled = await h.config.save({ revision: null, enabled: false, model: "gpt-4.1-mini", apiKey: storedKey });
  assert.equal(disabled.keyPresent, true);
  for (const purpose of ["core", "content"] as const) assert.equal((await h.config.runtime(purpose)).apiKey, null);
  const cleared = await h.config.save({ revision: disabled.revision, enabled: false, model: disabled.model, clearKey: true });
  assert.equal(cleared.keyPresent, false); assert.equal(cleared.source, "DATABASE"); assert.equal((await h.config.runtime("content")).apiKey, null);
  await assert.rejects(h.config.save({ revision: cleared.revision, enabled: true, model: cleared.model }), /AI_KEY_REQUIRED/);
});
test("legacy content keeps its existing gate until a manual setting is saved", async () => {
  const h = fixture({ AI_CORE_ENABLE_EXTERNAL_CALLS: "false" });
  assert.equal((await h.config.runtime()).apiKey, null); assert.equal((await h.config.runtime("content")).apiKey, oldKey);
  await h.config.save({ revision: null, enabled: false, model: "gpt-4.1-mini" });
  assert.equal((await h.config.runtime("content")).apiKey, null);
});
test("concurrent saves cannot overwrite a newer key or switch", async () => {
  const h = fixture();
  const saves = await Promise.allSettled([h.config.save({ revision: null, enabled: true, model: "gpt-4.1-mini", apiKey: storedKey }), h.config.save({ revision: null, enabled: false, model: "gpt-4.1-mini" })]);
  assert.equal(saves.filter(row => row.status === "fulfilled").length, 1); assert.equal(h.writes(), 1);
  const failed = saves.find(row => row.status === "rejected") as PromiseRejectedResult;
  assert.match(failed.reason.message, /AI_SETTINGS_CONFLICT/);
});
test("validation rejects masked keys, injected headers, invalid models and ambiguous removal", async () => {
  const h = fixture();
  for (const apiKey of ["••••1234", "sk-short", storedKey + "\nInjected: value", 123]) await assert.rejects(h.config.save({ revision: null, enabled: true, model: "gpt-4.1-mini", apiKey }), /AI_KEY_INVALID/);
  for (const model of ["../../models", "https://untrusted.test", "a".repeat(121), {}]) await assert.rejects(h.config.save({ revision: null, enabled: true, model }), /AI_SETTINGS_INVALID/);
  await assert.rejects(h.config.save({ revision: null, enabled: true, model: "gpt-4.1-mini", clearKey: true }), /AI_CLEAR_KEY_REQUIRES_DISABLED/);
  assert.equal(h.writes(), 0);
});
test("missing encryption and unreadable settings cannot silently fall back to an older key", async () => {
  const h = fixture({ INTEGRATION_SETTINGS_ENCRYPTION_KEY: "" });
  assert.equal((await h.config.snapshot()).canSave, false);
  await assert.rejects(h.config.save({ revision: null, model: "gpt-4.1-mini", enabled: true }), /AI_ENCRYPTION_NOT_CONFIGURED/);
  const healthy = fixture(); await healthy.config.save({ revision: null, model: "gpt-4.1-mini", enabled: true, apiKey: storedKey });
  healthy.env.INTEGRATION_SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 18).toString("base64");
  await assert.rejects(healthy.config.runtime("content"), /AI_KEY_UNREADABLE/);
  healthy.store.read = async () => { throw new Error("unavailable"); };
  await assert.rejects(healthy.config.runtime(), /unavailable/);
});
test("connection test uses only model metadata at the fixed OpenAI endpoint and never saves or generates", async () => {
  const h = fixture();
  const result = await h.config.test({ apiKey: storedKey, model: "gpt-4.1-mini", baseUrl: "https://untrusted.test" }, async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/models/gpt-4.1-mini"); assert.equal(init?.method, undefined); assert.equal(init?.body, undefined); assert.equal(init?.redirect, "error");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer " + storedKey);
    return Response.json({ object: "model", id: "gpt-4.1-mini" });
  });
  assert.equal(result.generationRequests, 0); assert.equal(result.saved, false); assert.equal(h.writes(), 0); assert.equal(h.row(), null);
  await h.config.save({ revision: null, model: "gpt-4.1-mini", enabled: true, apiKey: storedKey });
  assert.equal((await h.config.runtime()).baseUrl, "https://api.openai.com/v1");
});
test("provider failures are controlled and cannot echo credentials into the response", async () => {
  const h = fixture();
  for (const [status, code, expected] of [[401, "invalid_api_key", "AI_ACCESS_DENIED"], [429, "insufficient_quota", "AI_QUOTA_EXCEEDED"], [429, "rate_limit_exceeded", "AI_RATE_LIMITED"], [404, "model_not_found", "AI_MODEL_UNAVAILABLE"]] as const) {
    await assert.rejects(h.config.test({ apiKey: storedKey, model: "gpt-4.1-mini" }, async () => Response.json({ error: { code, message: storedKey + " donor@example.test" } }, { status })), error => error instanceof Error && error.message === expected);
  }
  await assert.rejects(h.config.test({}, async () => Response.json({ object: "model", id: "other" })), /AI_PROVIDER_UNAVAILABLE/);
  assert.equal(h.writes(), 0);
});
