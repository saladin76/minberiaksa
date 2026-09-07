import { randomUUID } from "node:crypto";
import type { IntegrationProvider } from "./catalog";
import { getFieldDefinition } from "./catalog";
import { encryptIntegrationSecret, IntegrationEncryptionError, integrationSecretContext } from "./crypto";
import { createDataToPatch, PROVIDER_STATE_KEY, safeFailureCode, trimEnvValue } from "./helpers";
import { IntegrationProviderTesterRegistry } from "./provider-testing";
import { IntegrationSettingsResolver } from "./resolver";
import { validateIntegrationSettingValue } from "./validation";
import type {
  IntegrationSettingCreateData,
  IntegrationSettingInput,
  IntegrationSettingMutation,
  IntegrationSettingRecord,
  IntegrationSettingSaveResult,
  IntegrationSettingsActor,
  IntegrationSettingsAuditEntry,
  IntegrationSettingsAuditWriter,
  IntegrationSettingsRepository,
  IntegrationSettingsServiceOptions,
  SafeIntegrationProviderSnapshot,
  SafeProviderConnectionTestResponse,
} from "./types";
import { IntegrationSettingsError } from "./types";
export * from "./types";

type Ctx = { provider: IntegrationProvider; actor: IntegrationSettingsActor };

export class IntegrationSettingsService {
  private readonly resolver: IntegrationSettingsResolver;
  private readonly tester;
  private readonly candidateVersion: () => string;

  constructor(
    private readonly repository: IntegrationSettingsRepository,
    private readonly auditWriter: IntegrationSettingsAuditWriter,
    options: IntegrationSettingsServiceOptions = {}
  ) {
    this.resolver = new IntegrationSettingsResolver(repository, auditWriter, options);
    this.tester = options.providerTester ?? new IntegrationProviderTesterRegistry();
    this.candidateVersion = options.candidateVersion ?? randomUUID;
  }

  clearProviderCache(provider: IntegrationProvider) { this.resolver.clearProviderCache(provider); }
  getProviderSnapshot(provider: IntegrationProvider, actor?: IntegrationSettingsActor) { return this.resolver.getProviderSnapshot(provider, actor); }
  getResolvedValue(provider: IntegrationProvider, key: string, actor?: IntegrationSettingsActor) { return this.resolver.getResolvedValue(provider, key, actor); }
  getResolvedProviderValues(provider: IntegrationProvider, actor?: IntegrationSettingsActor) { return this.resolver.getResolvedProviderValues(provider, actor); }
  getCandidateConfiguration(provider: IntegrationProvider, actor?: IntegrationSettingsActor) { return this.resolver.getCandidateConfiguration(provider, actor); }

  private audit(entry: IntegrationSettingsAuditEntry) { return this.auditWriter.write(entry); }
  private fail(ctx: Ctx, action: string, reasonCode: string, key?: string, metadata?: IntegrationSettingsAuditEntry["metadata"]) {
    return this.audit({ ...ctx, key, action, success: false, metadata: { reasonCode, ...(metadata ?? {}) } });
  }
  private async rows(provider: IntegrationProvider, actor: IntegrationSettingsActor, action: string) {
    try { return await this.repository.listByProvider(provider); }
    catch {
      await this.fail({ provider, actor }, action, "REPOSITORY_FAILURE");
      throw new IntegrationSettingsError("REPOSITORY_FAILURE", "Unable to access integration settings");
    }
  }

  private base(ctx: Ctx, key: string, existing: IntegrationSettingRecord | null, secret: boolean): IntegrationSettingCreateData {
    return {
      provider: ctx.provider,
      key,
      encryptedValue: existing?.encryptedValue ?? null,
      plainValue: existing?.plainValue ?? null,
      isSecret: secret,
      enabled: existing?.enabled ?? true,
      version: existing?.version ?? 0,
      source: "DATABASE",
      pendingEncryptedValue: existing?.pendingEncryptedValue ?? null,
      pendingPlainValue: existing?.pendingPlainValue ?? null,
      pendingVersion: existing?.pendingVersion ?? null,
      pendingCandidateVersion: existing?.pendingCandidateVersion ?? null,
      pendingCreatedAt: existing?.pendingCreatedAt ?? null,
      pendingUpdatedBy: existing?.pendingUpdatedBy ?? null,
      candidateVersion: existing?.candidateVersion ?? null,
      candidateCreatedAt: existing?.candidateCreatedAt ?? null,
      candidateLastTestVersion: existing?.candidateLastTestVersion ?? null,
      candidateLastTestAt: existing?.candidateLastTestAt ?? null,
      candidateLastTestResult: existing?.candidateLastTestResult ?? null,
      candidateFailureReasonSafe: existing?.candidateFailureReasonSafe ?? null,
      updatedBy: ctx.actor.actorId,
      lastTestAt: existing?.lastTestAt ?? null,
      lastTestResult: existing?.lastTestResult ?? null,
      lastFailureReasonSafe: existing?.lastFailureReasonSafe ?? null,
    };
  }

  async saveProviderSettings(
    provider: IntegrationProvider,
    inputs: readonly IntegrationSettingInput[],
    actor: IntegrationSettingsActor
  ): Promise<{ results: IntegrationSettingSaveResult[]; snapshot: SafeIntegrationProviderSnapshot }> {
    const ctx = { provider, actor };
    const seen = new Set<string>();
    for (const input of inputs) {
      if (!getFieldDefinition(provider, input.key)) {
        await this.fail(ctx, "INTEGRATION_SETTING_SAVE_FAILED", "UNKNOWN_FIELD", input.key);
        throw new IntegrationSettingsError("UNKNOWN_FIELD", "Unknown integration setting field");
      }
      if (seen.has(input.key)) {
        await this.fail(ctx, "INTEGRATION_SETTING_SAVE_FAILED", "DUPLICATE_FIELD", input.key);
        throw new IntegrationSettingsError("DUPLICATE_FIELD", "Duplicate integration setting field");
      }
      seen.add(input.key);
    }

    const existingRows = await this.rows(provider, actor, "INTEGRATION_SETTING_SAVE_FAILED");
    const byKey = new Map(existingRows.map((row) => [row.key, row]));
    const prepared = new Map<string, { value: string; secret: boolean }>();
    const results: IntegrationSettingSaveResult[] = [];

    for (const input of inputs) {
      const field = getFieldDefinition(provider, input.key)!;
      if (!input.value.trim()) {
        results.push({ key: input.key, action: "UNCHANGED" });
        continue;
      }
      try {
        prepared.set(input.key, {
          value: validateIntegrationSettingValue(provider, input.key, input.value),
          secret: field.secret,
        });
      } catch (error) {
        await this.fail(ctx, "INTEGRATION_SETTING_SAVE_FAILED", "INVALID_FIELD_VALUE", input.key);
        throw error;
      }
    }

    if (!prepared.size) return { results, snapshot: await this.getProviderSnapshot(provider, actor) };

    const candidateVersion = this.candidateVersion();
    const now = this.resolver.now();
    const mutations: IntegrationSettingMutation[] = [];
    const state = byKey.get(PROVIDER_STATE_KEY) ?? null;
    const stateData = this.base(ctx, PROVIDER_STATE_KEY, state, false);
    stateData.candidateVersion = candidateVersion;
    stateData.candidateCreatedAt = now;
    stateData.candidateLastTestVersion = null;
    stateData.candidateLastTestAt = null;
    stateData.candidateLastTestResult = null;
    stateData.candidateFailureReasonSafe = null;
    mutations.push(state
      ? { type: "UPDATE", provider, key: PROVIDER_STATE_KEY, patch: createDataToPatch(stateData) }
      : { type: "CREATE", data: stateData });

    for (const row of existingRows) {
      if (row.key === PROVIDER_STATE_KEY) continue;
      const hasPending = !!(row.pendingEncryptedValue || row.pendingPlainValue);
      if (hasPending && !prepared.has(row.key)) {
        mutations.push({ type: "UPDATE", provider, key: row.key, patch: {
          pendingCandidateVersion: candidateVersion,
          pendingCreatedAt: now,
          pendingUpdatedBy: actor.actorId,
        } });
      }
    }

    for (const [key, item] of prepared) {
      const field = getFieldDefinition(provider, key)!;
      const existing = byKey.get(key) ?? null;
      const data = this.base(ctx, key, existing, field.secret);
      data.pendingVersion = Math.max(existing?.version ?? 0, existing?.pendingVersion ?? 0) + 1;
      data.pendingCandidateVersion = candidateVersion;
      data.pendingCreatedAt = now;
      data.pendingUpdatedBy = actor.actorId;
      if (item.secret) {
        try {
          data.pendingEncryptedValue = encryptIntegrationSecret(item.value, integrationSecretContext(provider, key), this.resolver.encryptionKey());
          data.pendingPlainValue = null;
        } catch (error) {
          const code = error instanceof IntegrationEncryptionError ? error.code : "ENCRYPTION_KEY_INVALID";
          await this.fail(ctx, "INTEGRATION_SETTING_SAVE_FAILED", code, key);
          throw new IntegrationSettingsError(code, "Encryption key is missing or invalid");
        }
      } else {
        data.pendingPlainValue = item.value;
        data.pendingEncryptedValue = null;
      }
      mutations.push(existing
        ? { type: "UPDATE", provider, key, patch: createDataToPatch(data) }
        : { type: "CREATE", data });
      results.push({ key, action: "STAGED" });
    }

    try { await this.repository.applyMutations(mutations); }
    catch {
      await this.fail(ctx, "INTEGRATION_SETTING_SAVE_FAILED", "REPOSITORY_FAILURE");
      throw new IntegrationSettingsError("REPOSITORY_FAILURE", "Unable to stage integration settings");
    }

    this.clearProviderCache(provider);
    await this.audit({ ...ctx, action: "INTEGRATION_PROVIDER_CANDIDATE_STAGED", success: true, metadata: { candidateVersion, changedFields: prepared.size } });
    return { results, snapshot: await this.getProviderSnapshot(provider, actor) };
  }

  async testProviderConnection(provider: IntegrationProvider, actor: IntegrationSettingsActor): Promise<SafeProviderConnectionTestResponse> {
    const ctx = { provider, actor };
    const candidate = await this.getCandidateConfiguration(provider, actor);
    const testedAt = this.resolver.now();
    await this.audit({ ...ctx, action: "INTEGRATION_PROVIDER_TEST_STARTED", success: true, metadata: { candidateVersion: candidate.candidateVersion } });

    if (candidate.missingRequiredFields.length) {
      const failureCode = "MISSING_REQUIRED_FIELDS";
      if (candidate.candidateVersion) {
        await this.repository.recordCandidateTestResult(provider, candidate.candidateVersion, {
          candidateLastTestVersion: candidate.candidateVersion,
          candidateLastTestAt: testedAt,
          candidateLastTestResult: "FAILED",
          candidateFailureReasonSafe: failureCode,
        });
      }
      this.clearProviderCache(provider);
      await this.fail(ctx, "INTEGRATION_PROVIDER_TEST_FAILED", failureCode, undefined, { candidateVersion: candidate.candidateVersion, missingFields: candidate.missingRequiredFields });
      return { success: false, provider, testedAt: testedAt.toISOString(), candidateVersion: candidate.candidateVersion, connectionStatus: "NOT_CONFIGURED", messageAr: "بيانات المزود المطلوبة غير مكتملة.", failureCode, missingRequiredFields: candidate.missingRequiredFields };
    }

    let result;
    try {
      result = await this.tester.test({ provider, values: candidate.values, candidateVersion: candidate.candidateVersion });
    } catch {
      result = { success: false, connectionStatus: "FAILED" as const, messageAr: "تعذر تنفيذ اختبار الاتصال حاليًا.", failureCode: "PROVIDER_TEST_REQUEST_FAILED" };
    }

    if (candidate.candidateVersion) {
      const stored = await this.repository.recordCandidateTestResult(provider, candidate.candidateVersion, {
        candidateLastTestVersion: candidate.candidateVersion,
        candidateLastTestAt: testedAt,
        candidateLastTestResult: result.success ? "SUCCESS" : "FAILED",
        candidateFailureReasonSafe: result.success ? null : safeFailureCode(result.failureCode),
      });
      if (!stored) {
        await this.fail(ctx, "INTEGRATION_PROVIDER_TEST_RESULT_REJECTED", "CANDIDATE_CHANGED_DURING_TEST", undefined, { candidateVersion: candidate.candidateVersion });
        throw new IntegrationSettingsError("CANDIDATE_CHANGED_DURING_TEST", "Candidate changed while connection test was running");
      }
    }

    this.clearProviderCache(provider);
    await this.audit({ ...ctx, action: result.success ? "INTEGRATION_PROVIDER_TEST_SUCCEEDED" : "INTEGRATION_PROVIDER_TEST_FAILED", success: result.success, metadata: { candidateVersion: candidate.candidateVersion, ...(result.failureCode ? { failureReasonCode: result.failureCode } : {}) } });
    if (!result.success) await this.audit({ ...ctx, action: "INTEGRATION_PROVIDER_ACTIVE_CONFIGURATION_PRESERVED", success: true, metadata: { candidateVersion: candidate.candidateVersion } });
    return { ...result, provider, testedAt: testedAt.toISOString(), candidateVersion: candidate.candidateVersion, missingRequiredFields: [] };
  }

  async activateProviderCandidate(provider: IntegrationProvider, candidateVersion: string, actor: IntegrationSettingsActor) {
    const ctx = { provider, actor };
    const result = await this.repository.activateCandidateAtomically(provider, candidateVersion, actor.actorId);
    if (result.status !== "ACTIVATED") {
      const code = result.status === "VERSION_MISMATCH" ? "CANDIDATE_VERSION_MISMATCH"
        : result.status === "NOT_VERIFIED" ? "CANDIDATE_NOT_VERIFIED"
        : result.status === "EMPTY_CANDIDATE" ? "EMPTY_CANDIDATE" : "CANDIDATE_NOT_FOUND";
      await this.fail(ctx, "INTEGRATION_PROVIDER_CANDIDATE_ACTIVATION_REJECTED", code, undefined, { candidateVersion });
      throw new IntegrationSettingsError(code, "Candidate configuration cannot be activated");
    }
    this.clearProviderCache(provider);
    await this.audit({ ...ctx, action: "INTEGRATION_PROVIDER_CANDIDATE_ACTIVATED", success: true, metadata: { candidateVersion, activatedFields: result.activatedFields } });
    return this.getProviderSnapshot(provider, actor);
  }

  async discardProviderCandidate(provider: IntegrationProvider, candidateVersion: string, actor: IntegrationSettingsActor, failureReason?: string | null) {
    const ctx = { provider, actor };
    const result = await this.repository.discardCandidateAtomically(provider, candidateVersion);
    if (result.status !== "DISCARDED") {
      const code = result.status === "VERSION_MISMATCH" ? "CANDIDATE_VERSION_MISMATCH" : "CANDIDATE_NOT_FOUND";
      await this.fail(ctx, "INTEGRATION_PROVIDER_CANDIDATE_DISCARD_REJECTED", code, undefined, { candidateVersion });
      throw new IntegrationSettingsError(code, "Candidate configuration cannot be discarded");
    }
    this.clearProviderCache(provider);
    const reason = safeFailureCode(failureReason);
    await this.audit({ ...ctx, action: "INTEGRATION_PROVIDER_CANDIDATE_DISCARDED", success: true, metadata: { candidateVersion, discardedFields: result.discardedFields, ...(reason ? { failureReasonCode: reason } : {}) } });
    return this.getProviderSnapshot(provider, actor);
  }

  async deleteSetting(provider: IntegrationProvider, key: string, actor: IntegrationSettingsActor) {
    const ctx = { provider, actor };
    if (!getFieldDefinition(provider, key)) throw new IntegrationSettingsError("UNKNOWN_FIELD", "Unknown integration setting field");
    const existing = (await this.rows(provider, actor, "INTEGRATION_SETTING_DELETE_FAILED")).find((row) => row.key === key);
    if (!existing) throw new IntegrationSettingsError("SETTING_NOT_FOUND", "Integration setting was not found");
    await this.repository.applyMutations([{ type: "DELETE", provider, key }]);
    this.clearProviderCache(provider);
    await this.audit({ ...ctx, key, action: "INTEGRATION_SETTING_DELETED", success: true, metadata: { isSecret: existing.isSecret } });
    if (trimEnvValue(this.resolver.env[getFieldDefinition(provider, key)!.envKey])) await this.audit({ ...ctx, key, action: "INTEGRATION_SETTING_SOURCE_CHANGED", success: true, metadata: { sourceBefore: "DATABASE", sourceAfter: "ENVIRONMENT" } });
    return this.getProviderSnapshot(provider, actor);
  }

  async setProviderEnabled(provider: IntegrationProvider, enabled: boolean, actor: IntegrationSettingsActor) {
    const ctx = { provider, actor };
    const rows = await this.rows(provider, actor, "INTEGRATION_PROVIDER_STATUS_CHANGE_FAILED");
    const existing = rows.find((row) => row.key === PROVIDER_STATE_KEY) ?? null;
    const data = this.base(ctx, PROVIDER_STATE_KEY, existing, false);
    data.enabled = enabled;
    await this.repository.applyMutations([existing ? { type: "UPDATE", provider, key: PROVIDER_STATE_KEY, patch: createDataToPatch(data) } : { type: "CREATE", data }]);
    this.clearProviderCache(provider);
    await this.audit({ ...ctx, action: enabled ? "INTEGRATION_PROVIDER_ENABLED" : "INTEGRATION_PROVIDER_DISABLED", success: true, metadata: { enabled } });
    return this.getProviderSnapshot(provider, actor);
  }
}
