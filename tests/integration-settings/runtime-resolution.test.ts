import test from "node:test";
import assert from "node:assert/strict";
import { IntegrationSettingsResolver } from "../../lib/integration-settings/resolver";
import { encryptIntegrationSecret, integrationSecretContext } from "../../lib/integration-settings/crypto";
import { PROVIDER_STATE_KEY } from "../../lib/integration-settings/helpers";
import type { IntegrationSettingRecord, IntegrationSettingsRepository } from "../../lib/integration-settings/types";

const KEY = Buffer.alloc(32, 7).toString("base64");
const now = new Date("2026-07-14T10:00:00.000Z");
const base = (provider: string, key: string, patch: Partial<IntegrationSettingRecord> = {}): IntegrationSettingRecord => ({
  id: `${provider}-${key}`,
  provider,
  key,
  encryptedValue: null,
  plainValue: null,
  isSecret: false,
  enabled: true,
  version: 1,
  source: "DATABASE",
  pendingEncryptedValue: null,
  pendingPlainValue: null,
  pendingVersion: null,
  pendingCandidateVersion: null,
  pendingCreatedAt: null,
  pendingUpdatedBy: null,
  candidateVersion: null,
  candidateCreatedAt: null,
  candidateLastTestVersion: null,
  candidateLastTestAt: null,
  candidateLastTestResult: null,
  candidateFailureReasonSafe: null,
  createdAt: now,
  updatedAt: now,
  updatedBy: null,
  lastTestAt: null,
  lastTestResult: null,
  lastFailureReasonSafe: null,
  ...patch,
});

function repository(rows: IntegrationSettingRecord[], unavailable = false): IntegrationSettingsRepository {
  return {
    async listByProvider(provider) {
      if (unavailable) throw new Error("db unavailable");
      return rows.filter((row) => row.provider === provider);
    },
    async applyMutations() { return []; },
    async recordCandidateTestResult() { return false; },
    async activateCandidateAtomically() { return { status: "CANDIDATE_NOT_FOUND" }; },
    async discardCandidateAtomically() { return { status: "CANDIDATE_NOT_FOUND" }; },
  };
}

const audit = { write: async () => {} };

function resolver(rows: IntegrationSettingRecord[], env: NodeJS.ProcessEnv, unavailable = false) {
  return new IntegrationSettingsResolver(repository(rows, unavailable), audit, { env, encryptionKey: () => KEY, cacheTtlMs: 1 });
}

test("active database values override environment fallback", async () => {
  const encrypted = encryptIntegrationSecret("db-active-key-123456789012345", integrationSecretContext("ELASTIC_EMAIL", "API_KEY"), KEY);
  const r = resolver([
    base("ELASTIC_EMAIL", "API_KEY", { isSecret: true, encryptedValue: encrypted }),
    base("ELASTIC_EMAIL", "SENDER_EMAIL", { plainValue: "db@example.org" }),
    base("ELASTIC_EMAIL", "SENDER_NAME", { plainValue: "DBSENDER" }),
  ], { NODE_ENV: "test", ELASTIC_EMAIL_API_KEY: "env-key", ELASTIC_EMAIL_SENDER_EMAIL: "env@example.org", ELASTIC_EMAIL_SENDER_NAME: "ENVSENDER" });
  const state = await r.getActiveRuntimeResolution("ELASTIC_EMAIL");
  assert.equal(state.values.API_KEY, "db-active-key-123456789012345");
  assert.equal(state.values.SENDER_EMAIL, "db@example.org");
  assert.equal(state.sources.API_KEY, "DATABASE");
});

test("environment values fill only missing active fields", async () => {
  const r = resolver([], { NODE_ENV: "test", ELASTIC_EMAIL_API_KEY: "env-api-key-123456789012345", ELASTIC_EMAIL_SENDER_EMAIL: "env@example.org", ELASTIC_EMAIL_SENDER_NAME: "ENVSENDER" });
  const state = await r.getActiveRuntimeResolution("ELASTIC_EMAIL");
  assert.equal(state.databaseAvailable, true);
  assert.equal(state.values.API_KEY, "env-api-key-123456789012345");
  assert.equal(state.sources.API_KEY, "ENVIRONMENT");
});

test("pending values are never returned by active runtime resolution", async () => {
  const active = encryptIntegrationSecret("active-api-key-123456789012345", integrationSecretContext("ELASTIC_EMAIL", "API_KEY"), KEY);
  const pending = encryptIntegrationSecret("pending-api-key-987654321098765", integrationSecretContext("ELASTIC_EMAIL", "API_KEY"), KEY);
  const candidateVersion = "11111111-1111-4111-8111-111111111111";
  const r = resolver([
    base("ELASTIC_EMAIL", PROVIDER_STATE_KEY, { candidateVersion }),
    base("ELASTIC_EMAIL", "API_KEY", { isSecret: true, encryptedValue: active, pendingEncryptedValue: pending, pendingVersion: 2, pendingCandidateVersion: candidateVersion }),
    base("ELASTIC_EMAIL", "SENDER_EMAIL", { plainValue: "active@example.org", pendingPlainValue: "pending@example.org", pendingVersion: 2, pendingCandidateVersion: candidateVersion }),
    base("ELASTIC_EMAIL", "SENDER_NAME", { plainValue: "ACTIVE" }),
  ], { NODE_ENV: "test" });
  const state = await r.getActiveRuntimeResolution("ELASTIC_EMAIL");
  assert.equal(state.values.API_KEY, "active-api-key-123456789012345");
  assert.equal(state.values.SENDER_EMAIL, "active@example.org");
  assert.equal(JSON.stringify(state).includes("pending-api-key"), false);
  assert.equal(JSON.stringify(state).includes("pending@example.org"), false);
});

test("corrupt active database secret fails closed and does not use environment", async () => {
  const r = resolver([
    base("ELASTIC_EMAIL", "API_KEY", { isSecret: true, encryptedValue: "corrupt-ciphertext" }),
    base("ELASTIC_EMAIL", "SENDER_EMAIL", { plainValue: "db@example.org" }),
    base("ELASTIC_EMAIL", "SENDER_NAME", { plainValue: "DBSENDER" }),
  ], { NODE_ENV: "test", ELASTIC_EMAIL_API_KEY: "valid-environment-key-123456789", ELASTIC_EMAIL_SENDER_EMAIL: "env@example.org", ELASTIC_EMAIL_SENDER_NAME: "ENVSENDER" });
  const state = await r.getActiveRuntimeResolution("ELASTIC_EMAIL");
  assert.deepEqual(state.decryptionFailedFields, ["API_KEY"]);
  assert.equal(state.values.API_KEY, undefined);
  assert.equal(state.sources.API_KEY, "DATABASE");
});

test("complete database outage permits environment fallback", async () => {
  const r = resolver([], { NODE_ENV: "test", NETGSM_USERCODE: "env-user", NETGSM_PASSWORD: "env-password", NETGSM_HEADER: "ENVHEADER" }, true);
  const state = await r.getActiveRuntimeResolution("NETGSM");
  assert.equal(state.databaseAvailable, false);
  assert.equal(state.values.USERCODE, "env-user");
  assert.equal(state.values.PASSWORD, "env-password");
  assert.equal(state.sources.USERCODE, "ENVIRONMENT");
});

test("disabled provider still exposes active secrets to server-only webhook resolution", async () => {
  const appSecret = encryptIntegrationSecret("active-app-secret-value", integrationSecretContext("META_WHATSAPP", "APP_SECRET"), KEY);
  const verifyToken = encryptIntegrationSecret("active-verify-token", integrationSecretContext("META_WHATSAPP", "WEBHOOK_VERIFY_TOKEN"), KEY);
  const r = resolver([
    base("META_WHATSAPP", PROVIDER_STATE_KEY, { enabled: false }),
    base("META_WHATSAPP", "APP_SECRET", { isSecret: true, encryptedValue: appSecret }),
    base("META_WHATSAPP", "WEBHOOK_VERIFY_TOKEN", { isSecret: true, encryptedValue: verifyToken }),
  ], { NODE_ENV: "test" });
  const state = await r.getActiveRuntimeResolution("META_WHATSAPP");
  assert.equal(state.enabled, false);
  assert.equal(state.values.APP_SECRET, "active-app-secret-value");
  assert.equal(state.values.WEBHOOK_VERIFY_TOKEN, "active-verify-token");
});
