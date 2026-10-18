import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runActiveProviderTest } from "../../lib/integration-settings/active-test-core";
import { PROVIDER_STATE_KEY } from "../../lib/integration-settings/helpers";
import { evaluateActiveRuntimePolicy, evaluateProviderReadiness, READINESS_FAILURE_CODE } from "../../lib/integration-settings/runtime-policy";
import { IntegrationSettingsService } from "../../lib/integration-settings/service";
import type {
  IntegrationProviderTester,
  IntegrationSettingMutation,
  IntegrationSettingRecord,
  IntegrationSettingsRepository,
} from "../../lib/integration-settings/types";

const KEY = Buffer.alloc(32, 9).toString("base64");
const actor = { actorId: "507f1f77bcf86cd799439011", actorRole: "ADMIN", actorName: "Tester" };

/* A complete Meta configuration, supplied the way production supplies APP_ID: from the environment. */
const META_ENV = {
  NODE_ENV: "test" as const,
  META_WHATSAPP_ACCESS_TOKEN: "EAAG-system-user-token-for-tests-1234567890",
  META_WHATSAPP_APP_ID: "872208960455201",
  META_BUSINESS_PORTFOLIO_ID: "118938273925574",
  META_WHATSAPP_APP_SECRET: "0123456789abcdef0123456789abcdef",
  META_WHATSAPP_WEBHOOK_VERIFY_TOKEN: "minber_whatsapp_verify_2026",
  META_GRAPH_VERSION: "v23.0",
};
const META_REQUIRED = ["ACCESS_TOKEN", "APP_ID", "BUSINESS_PORTFOLIO_ID", "APP_SECRET", "WEBHOOK_VERIFY_TOKEN", "GRAPH_API_VERSION"];

class Repo implements IntegrationSettingsRepository {
  readonly rows = new Map<string, IntegrationSettingRecord>();
  unavailable = false;
  private id = 0;
  async listByProvider(provider: string) {
    if (this.unavailable) throw new Error("database down");
    return [...this.rows.values()].filter((row) => row.provider === provider).map((row) => ({ ...row }));
  }
  async applyMutations(mutations: readonly IntegrationSettingMutation[]) {
    const changed: IntegrationSettingRecord[] = [];
    for (const m of mutations) {
      const now = new Date();
      if (m.type === "CREATE") {
        const row = { ...m.data, id: `id-${++this.id}`, createdAt: now, updatedAt: now } as IntegrationSettingRecord;
        this.rows.set(`${row.provider}:${row.key}`, row);
        changed.push(row);
      } else if (m.type === "UPDATE") {
        const k = `${m.provider}:${m.key}`;
        const row = { ...this.rows.get(k)!, ...m.patch, updatedAt: now };
        this.rows.set(k, row);
        changed.push(row);
      } else {
        this.rows.delete(`${m.provider}:${m.key}`);
      }
    }
    return changed;
  }
  async recordCandidateTestResult() { return false; }
  async activateCandidateAtomically() { return { status: "CANDIDATE_NOT_FOUND" as const }; }
  async discardCandidateAtomically() { return { status: "CANDIDATE_NOT_FOUND" as const }; }
}

function setup(env: NodeJS.ProcessEnv = META_ENV) {
  const repo = new Repo();
  const audits: string[] = [];
  const service = new IntegrationSettingsService(repo, { write: async (entry) => { audits.push(entry.action); } }, {
    env,
    encryptionKey: () => KEY,
    cacheTtlMs: 30_000,
  });
  return { repo, service, audits };
}

function stateRow(enabled: boolean, extra: Partial<IntegrationSettingRecord> = {}): IntegrationSettingRecord {
  const now = new Date();
  return {
    id: "state", provider: "META_WHATSAPP", key: PROVIDER_STATE_KEY, encryptedValue: null, plainValue: null, isSecret: false,
    enabled, version: 0, source: "DATABASE", pendingEncryptedValue: null, pendingPlainValue: null, pendingVersion: null,
    pendingCandidateVersion: null, pendingCreatedAt: null, pendingUpdatedBy: null, candidateVersion: null, candidateCreatedAt: null,
    candidateLastTestVersion: null, candidateLastTestAt: null, candidateLastTestResult: null, candidateFailureReasonSafe: null,
    updatedBy: actor.actorId, lastTestAt: null, lastTestResult: null, lastFailureReasonSafe: null, createdAt: now, updatedAt: now,
    ...extra,
  } as IntegrationSettingRecord;
}

function trackingTester() {
  let calls = 0;
  const tester: IntegrationProviderTester = {
    test: async () => { calls++; return { success: true, connectionStatus: "CONNECTED", messageAr: "ok", failureCode: null }; },
  };
  return { tester, calls: () => calls };
}

async function activeCheck(service: IntegrationSettingsService, tester: IntegrationProviderTester) {
  return runActiveProviderTest("META_WHATSAPP", actor, {
    resolveActiveRuntime: (p, a) => service.getActiveRuntimeResolution(p, a),
    tester,
    record: async () => {},
  });
}

test("a disabled provider with complete data is PROVIDER_DISABLED, not a phantom gap in every field", async () => {
  const { repo, service } = setup();
  repo.rows.set(`META_WHATSAPP:${PROVIDER_STATE_KEY}`, stateRow(false));
  const { tester, calls } = trackingTester();

  const result = await activeCheck(service, tester);
  assert.equal(result.success, false);
  assert.equal(result.failureCode, "PROVIDER_DISABLED");
  assert.deepEqual(result.missingRequiredFields, []);
  assert.equal(calls(), 0, "nothing is sent to Meta for a disabled provider");

  /* The values are still all there  only the switch is off. */
  const runtime = await service.getActiveRuntimeResolution("META_WHATSAPP");
  assert.equal(runtime.enabled, false);
  assert.deepEqual(Object.keys(runtime.values).sort(), [...META_REQUIRED].sort());
  assert.deepEqual(runtime.missingRequiredFields, []);
});

test("settings page, active check and send path report the same state", async () => {
  const { repo, service } = setup();
  repo.rows.set(`META_WHATSAPP:${PROVIDER_STATE_KEY}`, stateRow(false));
  const snapshot = await service.getProviderSnapshot("META_WHATSAPP");
  const check = await activeCheck(service, trackingTester().tester);
  const runtime = await service.getActiveRuntimeResolution("META_WHATSAPP");
  /* What runtime-config.ts evaluates before every send and sender verification. */
  const sendPath = evaluateActiveRuntimePolicy({ ...runtime, requiredFields: META_REQUIRED });

  assert.equal(snapshot.status, "DISABLED");
  assert.equal(snapshot.readinessFailureCode, "PROVIDER_DISABLED");
  assert.equal(check.failureCode, "PROVIDER_DISABLED");
  assert.equal(sendPath.configured, false);
  if (!sendPath.configured) assert.equal(READINESS_FAILURE_CODE[sendPath.reason], "PROVIDER_DISABLED");
});

test("a real gap is MISSING_REQUIRED_FIELDS and names only the missing fields", async () => {
  const { META_WHATSAPP_APP_ID: _omit, ...withoutAppId } = META_ENV;
  void _omit;
  const { service } = setup(withoutAppId);
  const check = await activeCheck(service, trackingTester().tester);
  assert.equal(check.failureCode, "MISSING_REQUIRED_FIELDS");
  assert.deepEqual(check.missingRequiredFields, ["APP_ID"]);
  const snapshot = await service.getProviderSnapshot("META_WHATSAPP");
  assert.equal(snapshot.status, "NOT_CONFIGURED");
  assert.equal(snapshot.readinessFailureCode, "MISSING_REQUIRED_FIELDS");
});

test("a stored value that fails to decrypt is its own outcome", async () => {
  const { repo, service } = setup();
  repo.rows.set("META_WHATSAPP:ACCESS_TOKEN", {
    ...stateRow(true), id: "tok", key: "ACCESS_TOKEN", isSecret: true, encryptedValue: "v1.broken.envelope.value",
  });
  const check = await activeCheck(service, trackingTester().tester);
  assert.equal(check.failureCode, "INTEGRATION_DECRYPTION_FAILED");
  assert.deepEqual(check.missingRequiredFields, []);
  assert.equal((await service.getProviderSnapshot("META_WHATSAPP")).readinessFailureCode, "INTEGRATION_DECRYPTION_FAILED");
});

test("an unreadable settings database is its own outcome, even with environment values present", async () => {
  const { repo, service } = setup();
  repo.unavailable = true;
  const check = await activeCheck(service, trackingTester().tester);
  assert.equal(check.failureCode, "INTEGRATION_DATABASE_UNAVAILABLE");
  const snapshot = await service.getProviderSnapshot("META_WHATSAPP");
  assert.equal(snapshot.status, "ERROR");
  assert.equal(snapshot.readinessFailureCode, "INTEGRATION_DATABASE_UNAVAILABLE");
});

test("a resolver that throws is reported as an unreadable database, not as missing data", async () => {
  const result = await runActiveProviderTest("META_WHATSAPP", actor, {
    resolveActiveRuntime: async () => { throw new Error("boom"); },
    tester: trackingTester().tester,
    record: async () => {},
  });
  assert.equal(result.failureCode, "INTEGRATION_DATABASE_UNAVAILABLE");
});

test("only a ready provider reaches the provider tester", async () => {
  const { service } = setup();
  const { tester, calls } = trackingTester();
  const check = await activeCheck(service, tester);
  assert.equal(check.success, true);
  assert.equal(calls(), 1);
});

test("enabling the provider is reflected by the next evaluation, and the stale check result is cleared", async () => {
  const { repo, service } = setup();
  repo.rows.set(`META_WHATSAPP:${PROVIDER_STATE_KEY}`, stateRow(false, {
    lastTestAt: new Date("2026-10-18T11:48:52Z"), lastTestResult: "FAILED", lastFailureReasonSafe: "MISSING_REQUIRED_FIELDS",
  }));
  assert.equal((await service.getProviderSnapshot("META_WHATSAPP")).status, "DISABLED"); // warms the cache

  await service.setProviderEnabled("META_WHATSAPP", true, actor);

  const snapshot = await service.getProviderSnapshot("META_WHATSAPP");
  assert.equal(snapshot.status, "READY");
  assert.equal(snapshot.readinessFailureCode, null);
  assert.equal((await service.getActiveRuntimeResolution("META_WHATSAPP")).enabled, true);
  const state = repo.rows.get(`META_WHATSAPP:${PROVIDER_STATE_KEY}`)!;
  assert.equal(state.lastTestResult, null);
  assert.equal(state.lastFailureReasonSafe, null);
});

test("evaluateProviderReadiness keeps every outcome distinct", () => {
  const values = Object.fromEntries(META_REQUIRED.map((k) => [k, "x"]));
  const base = { enabled: true, databaseAvailable: true, values, decryptionFailedFields: [] as string[] };
  assert.equal(evaluateProviderReadiness(base, META_REQUIRED).ready, true);
  assert.equal(evaluateProviderReadiness({ ...base, enabled: false }, META_REQUIRED).failureCode, "PROVIDER_DISABLED");
  assert.equal(evaluateProviderReadiness({ ...base, databaseAvailable: false }, META_REQUIRED).failureCode, "INTEGRATION_DATABASE_UNAVAILABLE");
  assert.equal(evaluateProviderReadiness({ ...base, decryptionFailedFields: ["APP_SECRET"] }, META_REQUIRED).failureCode, "INTEGRATION_DECRYPTION_FAILED");
  const gap = evaluateProviderReadiness({ ...base, values: { ...values, APP_ID: "" } }, META_REQUIRED);
  assert.equal(gap.failureCode, "MISSING_REQUIRED_FIELDS");
  assert.deepEqual(gap.missingFields, ["APP_ID"]);
  /* The webhook path may run while the provider is switched off. */
  assert.equal(evaluateProviderReadiness({ ...base, enabled: false }, META_REQUIRED, { allowDisabled: true }).ready, true);
});

const read = (path: string) => readFileSync(path, "utf8");

test("the live active check reads the send path's resolver, fresh", () => {
  const source = read("lib/integration-settings/active-testing.ts");
  assert.match(source, /resolveActiveRuntime: dependencies\.resolveActiveRuntime \?\? \(\(p, a\) => getActiveIntegrationRuntimeResolution\(p, a\)\)/);
  assert.ok(source.indexOf("clearActiveIntegrationRuntimeCache(provider)") < source.indexOf("runActiveProviderTest(provider"));
  assert.doesNotMatch(read("lib/integration-settings/resolver.ts"), /getResolvedProviderValues/);
});

test("every settings mutation also clears the send path's cache", () => {
  const source = read("lib/integration-settings/prisma-service.ts");
  assert.match(source, /class PrismaIntegrationSettingsService extends IntegrationSettingsService/);
  assert.match(source, /runtimeResolver\.clearProviderCache\(provider\)/);
});

test("each readiness code has a dashboard label", () => {
  const ui = read("lib/integration-settings/ui.ts");
  for (const code of Object.values(READINESS_FAILURE_CODE)) assert.match(ui, new RegExp(`get ${code}\\(\\)`));
});
