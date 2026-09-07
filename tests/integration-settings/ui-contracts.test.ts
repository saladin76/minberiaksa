import test from "node:test";
import assert from "node:assert/strict";
import type { SafeIntegrationProviderSnapshot } from "../../lib/integration-settings/types";
import {
  buildIntegrationSettingsPatch,
  initializeIntegrationDrafts,
  payloadContainsSecret,
  providerCandidateBody,
  providerConnectionTestBody,
} from "../../lib/integration-settings/ui-contracts";

const snapshot: SafeIntegrationProviderSnapshot = {
  provider: "META_WHATSAPP",
  labelAr: "Meta WhatsApp",
  enabled: true,
  status: "READY",
  encryptionKeyConfigured: true,
  missingRequiredFields: [],
  candidate: { version: "11111111-1111-4111-8111-111111111111", hasChanges: true, createdAt: null, lastTestAt: null, lastTestResult: null, lastFailureReasonSafe: null },
  fields: [
    { key: "ACCESS_TOKEN", labelAr: "رمز الوصول", isSecret: true, required: true, configured: true, enabled: true, maskedValue: "••••1234", displayValue: null, source: "DATABASE", version: 1, hasPendingValue: false, pendingVersion: null, pendingCandidateVersion: null, pendingCreatedAt: null, updatedAt: null, updatedBy: null, lastTestAt: null, lastTestResult: null, lastFailureReasonSafe: null },
    { key: "GRAPH_API_VERSION", labelAr: "الإصدار", isSecret: false, required: true, configured: true, enabled: true, maskedValue: null, displayValue: "v23.0", source: "ENVIRONMENT", version: null, hasPendingValue: false, pendingVersion: null, pendingCandidateVersion: null, pendingCreatedAt: null, updatedAt: null, updatedBy: null, lastTestAt: null, lastTestResult: null, lastFailureReasonSafe: null },
  ],
};

test("saved secrets initialize blank while non-secret display values remain editable", () => {
  const drafts = initializeIntegrationDrafts(snapshot);
  assert.equal(drafts.ACCESS_TOKEN, "");
  assert.equal(drafts.GRAPH_API_VERSION, "v23.0");
  assert.equal(JSON.stringify(drafts).includes("••••1234"), false);
});

test("blank secret is omitted while changed non-secret is included", () => {
  const payload = buildIntegrationSettingsPatch(snapshot, { ACCESS_TOKEN: "", GRAPH_API_VERSION: "v24.0" }, new Set(["ACCESS_TOKEN", "GRAPH_API_VERSION"]));
  assert.deepEqual(payload, { settings: [{ key: "GRAPH_API_VERSION", value: "v24.0" }] });
});

test("provider test request cannot contain SUCCESS, FAILED, or credentials", () => {
  const payload = providerConnectionTestBody();
  assert.deepEqual(payload, {});
  assert.equal(JSON.stringify(payload).includes("SUCCESS"), false);
  assert.equal(JSON.stringify(payload).includes("FAILED"), false);
  assert.equal(payloadContainsSecret(payload, ["token-secret", "app-secret"]), false);
});

test("candidate activation and discard payload contain candidateVersion only", () => {
  const body = providerCandidateBody("11111111-1111-4111-8111-111111111111");
  assert.deepEqual(Object.keys(body), ["candidateVersion"]);
  assert.equal(body.candidateVersion, "11111111-1111-4111-8111-111111111111");
});

test("UI request contracts never require localStorage, sessionStorage, or URL secrets", () => {
  const source = [initializeIntegrationDrafts, buildIntegrationSettingsPatch, providerConnectionTestBody, providerCandidateBody].map(String).join("\n");
  assert.equal(source.includes("localStorage"), false);
  assert.equal(source.includes("sessionStorage"), false);
  assert.equal(source.includes("URLSearchParams"), false);
});
