import test from "node:test";
import assert from "node:assert/strict";
import { IntegrationSettingsService, IntegrationSettingsError } from "../../lib/integration-settings/service";
import type {
  CandidateActivationResult,
  CandidateDiscardResult,
  CandidateTestStatePatch,
  IntegrationProviderTester,
  IntegrationSettingMutation,
  IntegrationSettingRecord,
  IntegrationSettingsAuditEntry,
  IntegrationSettingsRepository,
  ProviderConnectionTestResult,
} from "../../lib/integration-settings/types";
import {
  INTEGRATION_SETTINGS_ROUTE_PERMISSIONS,
  integrationSettingsUpdateSchema,
  providerCandidateActivationSchema,
  providerConnectionTestSchema,
} from "../../lib/integration-settings/api-contracts";
import { userHasDashboardPermission } from "../../lib/dashboard/permissions";
import { PROVIDER_STATE_KEY } from "../../lib/integration-settings/helpers";

const KEY = Buffer.alloc(32, 9).toString("base64");
const actor = { actorId: "507f1f77bcf86cd799439011", actorRole: "ADMIN", actorName: "Tester" };
const UUIDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
];

class MemoryRepository implements IntegrationSettingsRepository {
  readonly rows = new Map<string, IntegrationSettingRecord>();
  writes = 0;
  private id = 0;
  private mapKey(provider: string, key: string) { return `${provider}:${key}`; }

  async listByProvider(provider: string) {
    return [...this.rows.values()].filter((row) => row.provider === provider).map((row) => ({ ...row }));
  }

  async applyMutations(mutations: readonly IntegrationSettingMutation[]) {
    this.writes += 1;
    const changed: IntegrationSettingRecord[] = [];
    for (const mutation of mutations) {
      if (mutation.type === "CREATE") {
        const now = new Date();
        const row: IntegrationSettingRecord = { ...mutation.data, id: `id-${++this.id}`, createdAt: now, updatedAt: now };
        this.rows.set(this.mapKey(row.provider, row.key), row);
        changed.push({ ...row });
      } else if (mutation.type === "UPDATE") {
        const mapKey = this.mapKey(mutation.provider, mutation.key);
        const existing = this.rows.get(mapKey);
        if (!existing) throw new Error("missing row");
        const row = { ...existing, ...mutation.patch, updatedAt: new Date() };
        this.rows.set(mapKey, row);
        changed.push({ ...row });
      } else {
        const mapKey = this.mapKey(mutation.provider, mutation.key);
        const existing = this.rows.get(mapKey);
        if (!existing) throw new Error("missing row");
        this.rows.delete(mapKey);
        changed.push({ ...existing });
      }
    }
    return changed;
  }

  async recordCandidateTestResult(provider: string, candidateVersion: string, patch: CandidateTestStatePatch) {
    const key = this.mapKey(provider, PROVIDER_STATE_KEY);
    const state = this.rows.get(key);
    if (!state || state.candidateVersion !== candidateVersion) return false;
    this.rows.set(key, { ...state, ...patch, updatedAt: new Date() });
    return true;
  }

  async activateCandidateAtomically(provider: string, candidateVersion: string, actorId: string): Promise<CandidateActivationResult> {
    const stateKey = this.mapKey(provider, PROVIDER_STATE_KEY);
    const state = this.rows.get(stateKey);
    if (!state?.candidateVersion) return { status: "CANDIDATE_NOT_FOUND" };
    if (state.candidateVersion !== candidateVersion) return { status: "VERSION_MISMATCH" };
    if (state.candidateLastTestVersion !== candidateVersion || state.candidateLastTestResult !== "SUCCESS" || !state.candidateLastTestAt || !state.candidateCreatedAt || state.candidateLastTestAt < state.candidateCreatedAt) return { status: "NOT_VERIFIED" };
    const pending = [...this.rows.values()].filter((row) => row.provider === provider && row.pendingCandidateVersion === candidateVersion);
    if (!pending.length) return { status: "EMPTY_CANDIDATE" };

    const next = new Map(this.rows);
    for (const row of pending) {
      next.set(this.mapKey(provider, row.key), {
        ...row,
        encryptedValue: row.isSecret ? row.pendingEncryptedValue : null,
        plainValue: row.isSecret ? null : row.pendingPlainValue,
        version: row.pendingVersion ?? row.version + 1,
        updatedBy: actorId,
        pendingEncryptedValue: null,
        pendingPlainValue: null,
        pendingVersion: null,
        pendingCandidateVersion: null,
        pendingCreatedAt: null,
        pendingUpdatedBy: null,
        lastTestAt: state.candidateLastTestAt,
        lastTestResult: "SUCCESS",
        lastFailureReasonSafe: null,
        updatedAt: new Date(),
      });
    }
    next.set(stateKey, {
      ...state,
      candidateVersion: null,
      candidateCreatedAt: null,
      candidateLastTestVersion: null,
      candidateLastTestAt: null,
      candidateLastTestResult: null,
      candidateFailureReasonSafe: null,
      lastTestAt: state.candidateLastTestAt,
      lastTestResult: "SUCCESS",
      updatedAt: new Date(),
    });
    this.rows.clear();
    for (const [key, value] of next) this.rows.set(key, value);
    return { status: "ACTIVATED", activatedFields: pending.length };
  }

  async discardCandidateAtomically(provider: string, candidateVersion: string): Promise<CandidateDiscardResult> {
    const stateKey = this.mapKey(provider, PROVIDER_STATE_KEY);
    const state = this.rows.get(stateKey);
    if (!state?.candidateVersion) return { status: "CANDIDATE_NOT_FOUND" };
    if (state.candidateVersion !== candidateVersion) return { status: "VERSION_MISMATCH" };
    const pending = [...this.rows.values()].filter((row) => row.provider === provider && row.pendingCandidateVersion === candidateVersion);
    for (const row of pending) this.rows.set(this.mapKey(provider, row.key), { ...row, pendingEncryptedValue: null, pendingPlainValue: null, pendingVersion: null, pendingCandidateVersion: null, pendingCreatedAt: null, pendingUpdatedBy: null });
    this.rows.set(stateKey, { ...state, candidateVersion: null, candidateCreatedAt: null, candidateLastTestVersion: null, candidateLastTestAt: null, candidateLastTestResult: null, candidateFailureReasonSafe: null });
    return { status: "DISCARDED", discardedFields: pending.length };
  }
}

function setup(options?: { env?: NodeJS.ProcessEnv; result?: ProviderConnectionTestResult }) {
  const repository = new MemoryRepository();
  const audits: IntegrationSettingsAuditEntry[] = [];
  let clock = 1_000;
  let versionIndex = 0;
  let result: ProviderConnectionTestResult = options?.result ?? { success: true, connectionStatus: "CONNECTED", messageAr: "نجح الاختبار.", failureCode: null };
  const providerTester: IntegrationProviderTester = { test: async () => result };
  const service = new IntegrationSettingsService(repository, { write: async (entry) => { audits.push(entry); } }, {
    env: options?.env ?? { NODE_ENV: "test" },
    encryptionKey: () => KEY,
    now: () => new Date(++clock),
    candidateVersion: () => UUIDS[versionIndex++] ?? crypto.randomUUID(),
    providerTester,
    cacheTtlMs: 60_000,
  });
  return { repository, audits, service, setResult: (next: ProviderConnectionTestResult) => { result = next; } };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error) => error instanceof IntegrationSettingsError && error.code === code);
}

const cronSecret = "cron-secret-that-is-long-enough-for-secure-use-123";

async function activateInitialCron(service: IntegrationSettingsService) {
  const staged = await service.saveProviderSettings("SYSTEM", [{ key: "CRON_SECRET", value: cronSecret }], actor);
  const version = staged.snapshot.candidate.version!;
  await service.testProviderConnection("SYSTEM", actor);
  await service.activateProviderCandidate("SYSTEM", version, actor);
}

test("public test contract rejects client supplied SUCCESS or FAILED", () => {
  assert.equal(providerConnectionTestSchema.safeParse({}).success, true);
  assert.equal(providerConnectionTestSchema.safeParse({ result: "SUCCESS" }).success, false);
  assert.equal(providerConnectionTestSchema.safeParse({ result: "FAILED" }).success, false);
});

test("first secret remains pending and is unavailable to active resolution", async () => {
  const { service } = setup();
  const saved = await service.saveProviderSettings("SYSTEM", [{ key: "CRON_SECRET", value: cronSecret }], actor);
  assert.equal(saved.results[0]?.action, "STAGED");
  assert.equal(saved.snapshot.fields[0]?.configured, false);
  assert.equal(saved.snapshot.fields[0]?.hasPendingValue, true);
  assert.equal(await service.getResolvedValue("SYSTEM", "CRON_SECRET", actor), null);
});

test("server-side tester result is recorded and secrets never appear in response or audit", async () => {
  const { service, audits } = setup();
  const saved = await service.saveProviderSettings("SYSTEM", [{ key: "CRON_SECRET", value: cronSecret }], actor);
  const response = await service.testProviderConnection("SYSTEM", actor);
  assert.equal(response.success, true);
  assert.equal(response.candidateVersion, saved.snapshot.candidate.version);
  assert.equal(JSON.stringify(response).includes(cronSecret), false);
  assert.equal(JSON.stringify(audits).includes(cronSecret), false);
  assert.ok(audits.some((entry) => entry.action === "INTEGRATION_PROVIDER_TEST_STARTED"));
  assert.ok(audits.some((entry) => entry.action === "INTEGRATION_PROVIDER_TEST_SUCCEEDED"));
});

test("failed provider test preserves the active configuration", async () => {
  const { service, setResult, audits } = setup();
  await activateInitialCron(service);
  const activeBefore = await service.getResolvedValue("SYSTEM", "CRON_SECRET", actor);
  const replacement = "replacement-cron-secret-that-is-long-enough-456";
  const staged = await service.saveProviderSettings("SYSTEM", [{ key: "CRON_SECRET", value: replacement }], actor);
  setResult({ success: false, connectionStatus: "FAILED", messageAr: "فشل الاختبار.", failureCode: "AUTH_REJECTED" });
  const tested = await service.testProviderConnection("SYSTEM", actor);
  assert.equal(tested.success, false);
  await expectCode(service.activateProviderCandidate("SYSTEM", staged.snapshot.candidate.version!, actor), "CANDIDATE_NOT_VERIFIED");
  assert.equal(await service.getResolvedValue("SYSTEM", "CRON_SECRET", actor), activeBefore);
  assert.ok(audits.some((entry) => entry.action === "INTEGRATION_PROVIDER_ACTIVE_CONFIGURATION_PRESERVED"));
});

test("editing any field after a successful test invalidates the previous candidate version", async () => {
  const { service } = setup({ env: { NODE_ENV: "test", ELASTIC_EMAIL_SENDER_EMAIL: "verified@example.org", ELASTIC_EMAIL_SENDER_NAME: "Gozbebekleri" } });
  const first = await service.saveProviderSettings("ELASTIC_EMAIL", [{ key: "API_KEY", value: "xkeysib-first-api-key-value-123456" }], actor);
  await service.testProviderConnection("ELASTIC_EMAIL", actor);
  const second = await service.saveProviderSettings("ELASTIC_EMAIL", [{ key: "SENDER_NAME", value: "Gözbebekleri" }], actor);
  assert.notEqual(first.snapshot.candidate.version, second.snapshot.candidate.version);
  await expectCode(service.activateProviderCandidate("ELASTIC_EMAIL", first.snapshot.candidate.version!, actor), "CANDIDATE_VERSION_MISMATCH");
  await expectCode(service.activateProviderCandidate("ELASTIC_EMAIL", second.snapshot.candidate.version!, actor), "CANDIDATE_NOT_VERIFIED");
});

test("provider activation commits all candidate fields together", async () => {
  const { service } = setup();
  const staged = await service.saveProviderSettings("ELASTIC_EMAIL", [
    { key: "API_KEY", value: "xkeysib-atomic-api-key-value-123456" },
    { key: "SENDER_EMAIL", value: "verified@example.org" },
    { key: "SENDER_NAME", value: "Gozbebekleri" },
  ], actor);
  const version = staged.snapshot.candidate.version!;
  await service.testProviderConnection("ELASTIC_EMAIL", actor);
  await service.activateProviderCandidate("ELASTIC_EMAIL", version, actor);
  const values = await service.getResolvedProviderValues("ELASTIC_EMAIL", actor);
  assert.equal(values.API_KEY, "xkeysib-atomic-api-key-value-123456");
  assert.equal(values.SENDER_EMAIL, "verified@example.org");
  assert.equal(values.SENDER_NAME, "Gozbebekleri");
});

test("environment fallback participates in candidate configuration", async () => {
  const { service } = setup({ env: { NODE_ENV: "test", ELASTIC_EMAIL_SENDER_EMAIL: "verified@example.org", ELASTIC_EMAIL_SENDER_NAME: "Gozbebekleri" } });
  await service.saveProviderSettings("ELASTIC_EMAIL", [{ key: "API_KEY", value: "xkeysib-candidate-api-key-value-123456" }], actor);
  const candidate = await service.getCandidateConfiguration("ELASTIC_EMAIL", actor);
  assert.equal(candidate.sources.API_KEY, "CANDIDATE");
  assert.equal(candidate.sources.SENDER_EMAIL, "ENVIRONMENT");
  assert.equal(candidate.values.SENDER_EMAIL, "verified@example.org");
  assert.deepEqual(candidate.missingRequiredFields, []);
});

test("API contracts and permission boundaries are provider-level", () => {
  assert.equal(providerCandidateActivationSchema.safeParse({ candidateVersion: UUIDS[0] }).success, true);
  assert.equal(providerCandidateActivationSchema.safeParse({ candidateVersion: "old" }).success, false);
  assert.equal(integrationSettingsUpdateSchema.safeParse({ settings: [{ key: "", value: "x" }] }).success, false);
  assert.equal(INTEGRATION_SETTINGS_ROUTE_PERMISSIONS.test, "platformConnectionsTest");
  assert.equal(INTEGRATION_SETTINGS_ROUTE_PERMISSIONS.activateCandidate, "platformConnectionsManage");
  assert.equal(userHasDashboardPermission(undefined, "platformConnectionsTest"), false);
  assert.equal(userHasDashboardPermission({ role: "STAFF", dashboardPermissions: ["platformConnections"] }, "platformConnectionsTest"), false);
  assert.equal(userHasDashboardPermission({ role: "STAFF", dashboardPermissions: ["platformConnectionsTest"] }, "platformConnectionsTest"), true);
  assert.equal(userHasDashboardPermission({ role: "STAFF", dashboardPermissions: ["platformConnectionsTest"] }, "platformConnectionsManage"), false);
});
