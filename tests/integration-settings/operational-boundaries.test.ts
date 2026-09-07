import test from "node:test";
import assert from "node:assert/strict";
import { runActiveProviderTest } from "../../lib/integration-settings/active-test-core";
import {
  brevoWebhookTokenMatches,
  buildBrevoWebhookUrl,
  generateBrevoWebhookToken,
  resolveBrevoWebhookSecret,
} from "../../lib/integration-settings/brevo-webhook";
import { cronInfrastructureStatus, isCronAuthorizationValid } from "../../lib/communication/cron-auth";
import { INTEGRATION_UI_ENDPOINTS, buildIntegrationSettingsPatch } from "../../lib/integration-settings/ui-contracts";
import { shouldResetIntegrationUiState } from "../../lib/integration-settings/ui-lifecycle";
import type { IntegrationProviderTester, SafeIntegrationProviderSnapshot } from "../../lib/integration-settings/types";

const actor = { actorId: "507f1f77bcf86cd799439011", actorRole: "ADMIN", actorName: "Tester" };

function brevoSnapshot(): SafeIntegrationProviderSnapshot {
  return {
    provider: "BREVO",
    labelAr: "Brevo",
    enabled: true,
    status: "READY",
    encryptionKeyConfigured: true,
    missingRequiredFields: [],
    candidate: { version: "11111111-1111-4111-8111-111111111111", hasChanges: true, createdAt: null, lastTestAt: null, lastTestResult: null, lastFailureReasonSafe: null },
    fields: [{
      key: "WEBHOOK_SECRET", labelAr: "مفتاح Webhook", isSecret: true, required: false,
      configured: true, enabled: true, maskedValue: "••••1234", displayValue: null, source: "DATABASE",
      version: 1, hasPendingValue: true, pendingVersion: 2,
      pendingCandidateVersion: "11111111-1111-4111-8111-111111111111", pendingCreatedAt: null,
      updatedAt: null, updatedBy: null, lastTestAt: null, lastTestResult: null, lastFailureReasonSafe: null,
    }],
  };
}

test("test-active receives active values only and ignores pending values", async () => {
  const activeToken = "active-api-key-value";
  const pendingToken = "pending-api-key-value";
  let testedToken = "";
  const tester: IntegrationProviderTester = {
    test: async (input) => {
      testedToken = input.values.API_KEY;
      return { success: true, connectionStatus: "CONNECTED", messageAr: "ok", failureCode: null };
    },
  };
  await runActiveProviderTest("BREVO", actor, {
    resolveActiveValues: async () => ({ API_KEY: activeToken, SMS_SENDER: "GOZBEBEK" }),
    tester,
    record: async () => {},
    now: () => new Date("2026-07-14T08:00:00.000Z"),
  });
  assert.equal(testedToken, activeToken);
  assert.notEqual(testedToken, pendingToken);
});

test("active test result persists independently and does not alter candidate test state", async () => {
  const candidateState = { version: "candidate-v1", result: "SUCCESS" };
  let stored: { result: string; failure: string | null } | null = null;
  await runActiveProviderTest("BREVO", actor, {
    resolveActiveValues: async () => ({ API_KEY: "active", SMS_SENDER: "GOZBEBEK" }),
    tester: { test: async () => ({ success: false, connectionStatus: "FAILED", messageAr: "failed", failureCode: "BREVO_UNAUTHORIZED" }) },
    record: async (_provider, _at, result) => { stored = { result: result.success ? "SUCCESS" : "FAILED", failure: result.failureCode }; },
  });
  assert.deepEqual(stored, { result: "FAILED", failure: "BREVO_UNAUTHORIZED" });
  assert.deepEqual(candidateState, { version: "candidate-v1", result: "SUCCESS" });
});

test("active and candidate UI endpoints are explicit and activation is separate", () => {
  assert.equal(INTEGRATION_UI_ENDPOINTS.testActive("BREVO").endsWith("/test-active"), true);
  assert.equal(INTEGRATION_UI_ENDPOINTS.testCandidate("BREVO").endsWith("/test-candidate"), true);
  assert.equal(INTEGRATION_UI_ENDPOINTS.testActive("BREVO").includes("activate"), false);
});

test("Brevo webhook token is server-generated and canonical URL contains it once", () => {
  const first = generateBrevoWebhookToken();
  const second = generateBrevoWebhookToken();
  assert.ok(first.length >= 43);
  assert.notEqual(first, second);
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", NEXTAUTH_URL: "https://example.org" };
  const url = buildBrevoWebhookUrl(first, env);
  assert.equal(url, `https://example.org/api/webhooks/brevo/transactional?token=${encodeURIComponent(first)}`);
  assert.equal((url.match(/token=/g) ?? []).length, 1);
});

test("Brevo webhook resolves active DB before environment and ignores candidate material", () => {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", BREVO_SMS_WEBHOOK_SECRET: "environment-secret" };
  assert.equal(resolveBrevoWebhookSecret("active-database-secret", env), "active-database-secret");
  assert.equal(resolveBrevoWebhookSecret(null, env), "environment-secret");
  const pendingCandidate = "pending-candidate-secret";
  assert.notEqual(resolveBrevoWebhookSecret(null, env), pendingCandidate);
});

test("Brevo webhook comparison is timing-safe compatible and no token appears in safe snapshot", () => {
  const token = generateBrevoWebhookToken();
  assert.equal(brevoWebhookTokenMatches(token, token), true);
  assert.equal(brevoWebhookTokenMatches(`${token}x`, token), false);
  assert.equal(JSON.stringify(brevoSnapshot()).includes(token), false);
});

test("Cron uses environment bearer only and protection check does not invoke a provider tester", async () => {
  const secret = "cron-secret-that-is-long-enough-for-infrastructure-123";
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", CRON_SECRET: secret };
  assert.equal(cronInfrastructureStatus(env).routeProtected, true);
  assert.equal(isCronAuthorizationValid(`Bearer ${secret}`, env), true);
  let testerCalled = false;
  const result = await runActiveProviderTest("SYSTEM", actor, {
    env,
    resolveActiveValues: async () => { throw new Error("Cron must not resolve DB credentials"); },
    tester: { test: async () => { testerCalled = true; throw new Error("Cron must not call external tester"); } },
    record: async () => {},
  });
  assert.equal(result.success, true);
  assert.equal(testerCalled, false);
  assert.match(result.messageAr, /لم يتم تشغيل أي حملة/);
});

test("Cron settings cannot be submitted from UI contracts", () => {
  const snapshot = { ...brevoSnapshot(), provider: "SYSTEM" as const };
  const payload = buildIntegrationSettingsPatch(snapshot, { WEBHOOK_SECRET: "secret" }, new Set(["WEBHOOK_SECRET"]));
  assert.deepEqual(payload, { settings: [] });
});

test("same-provider snapshot refresh keeps notices and last test state", () => {
  assert.equal(shouldResetIntegrationUiState("BREVO", "BREVO"), false);
  assert.equal(shouldResetIntegrationUiState("BREVO", "NETGSM"), true);
});
