import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVE_RUNTIME_POLICY_FAILURE,
  evaluateActiveRuntimePolicy,
} from "../../lib/integration-settings/runtime-policy";

test("database outage blocks new provider sends even when environment values exist", () => {
  const result = evaluateActiveRuntimePolicy({
    enabled: true,
    databaseAvailable: false,
    values: { API_KEY: "environment-value", EMAIL_SENDER_EMAIL: "sender@example.org" },
    decryptionFailedFields: [],
    requiredFields: ["API_KEY", "EMAIL_SENDER_EMAIL"],
  });

  assert.equal(result.configured, false);
  assert.equal(result.reason, ACTIVE_RUNTIME_POLICY_FAILURE.INTEGRATION_DATABASE_UNAVAILABLE);
});

test("database outage permits webhook verification fallback only when explicitly allowed", () => {
  const result = evaluateActiveRuntimePolicy({
    enabled: false,
    databaseAvailable: false,
    values: { APP_SECRET: "environment-secret", WEBHOOK_VERIFY_TOKEN: "environment-token" },
    decryptionFailedFields: [],
    requiredFields: ["APP_SECRET", "WEBHOOK_VERIFY_TOKEN"],
    allowDisabled: true,
    allowDatabaseFallback: true,
  });

  assert.equal(result.configured, true);
  assert.equal(result.reason, null);
});

test("decryption failure remains fail-closed even for webhook fallback", () => {
  const result = evaluateActiveRuntimePolicy({
    enabled: true,
    databaseAvailable: true,
    values: { APP_SECRET: "environment-secret" },
    decryptionFailedFields: ["APP_SECRET"],
    requiredFields: ["APP_SECRET"],
    allowDisabled: true,
    allowDatabaseFallback: true,
  });

  assert.equal(result.configured, false);
  assert.equal(result.reason, ACTIVE_RUNTIME_POLICY_FAILURE.INTEGRATION_DECRYPTION_FAILED);
  assert.deepEqual(result.missingFields, ["APP_SECRET"]);
});

test("disabled provider blocks new sends", () => {
  const result = evaluateActiveRuntimePolicy({
    enabled: false,
    databaseAvailable: true,
    values: { API_KEY: "active-value" },
    decryptionFailedFields: [],
    requiredFields: ["API_KEY"],
  });

  assert.equal(result.configured, false);
  assert.equal(result.reason, ACTIVE_RUNTIME_POLICY_FAILURE.PROVIDER_DISABLED);
});
