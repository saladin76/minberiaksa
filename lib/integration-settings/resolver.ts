import type { IntegrationProvider, IntegrationTestResult, IntegrationValueSource } from "./catalog";
import { getFieldDefinition, getProviderDefinition } from "./catalog";
import {
  decryptIntegrationSecret,
  IntegrationEncryptionError,
  integrationEncryptionKeyIsConfigured,
  integrationSecretContext,
  maskIntegrationValue,
} from "./crypto";
import { DEFAULT_CACHE_TTL_MS, PROVIDER_STATE_KEY, recordHasPendingValue, trimEnvValue } from "./helpers";
import type {
  IntegrationCandidateConfiguration,
  IntegrationSettingRecord,
  IntegrationSettingsActor,
  IntegrationSettingsAuditWriter,
  IntegrationSettingsRepository,
  IntegrationSettingsServiceOptions,
  SafeIntegrationProviderSnapshot,
} from "./types";
import { IntegrationSettingsError } from "./types";

type ResolvedIntegrationField = {
  definition: ReturnType<typeof getProviderDefinition>["fields"][number];
  record: IntegrationSettingRecord | null;
  configured: boolean;
  enabled: boolean;
  value: string | null;
  source: IntegrationValueSource;
  decryptionFailed: boolean;
};

type ResolvedIntegrationProvider = {
  provider: IntegrationProvider;
  enabled: boolean;
  databaseAvailable: boolean;
  stateRecord: IntegrationSettingRecord | null;
  records: IntegrationSettingRecord[];
  fields: ResolvedIntegrationField[];
};

type CachedProvider = { expiresAt: number; value: ResolvedIntegrationProvider };

export type ActiveRuntimeResolution = {
  provider: IntegrationProvider;
  enabled: boolean;
  databaseAvailable: boolean;
  values: Record<string, string>;
  sources: Record<string, IntegrationValueSource>;
  missingRequiredFields: string[];
  decryptionFailedFields: string[];
};

function isTestResult(value: string | null): value is IntegrationTestResult {
  return value === "SUCCESS" || value === "FAILED";
}

export class IntegrationSettingsResolver {
  readonly env: NodeJS.ProcessEnv;
  readonly now: () => Date;
  readonly encryptionKey: () => string | undefined;
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<IntegrationProvider, CachedProvider>();

  constructor(
    private readonly repository: IntegrationSettingsRepository,
    private readonly auditWriter: IntegrationSettingsAuditWriter,
    options: IntegrationSettingsServiceOptions = {}
  ) {
    this.env = options.env ?? process.env;
    this.cacheTtlMs = Math.min(options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS, 30_000);
    this.now = options.now ?? (() => new Date());
    this.encryptionKey = options.encryptionKey ?? (() => process.env.INTEGRATION_SETTINGS_ENCRYPTION_KEY);
  }

  clearProviderCache(provider: IntegrationProvider): void {
    this.cache.delete(provider);
  }

  async auditFailure(actor: IntegrationSettingsActor, provider: IntegrationProvider, key: string | undefined, action: string, reasonCode: string): Promise<void> {
    await this.auditWriter.write({ actor, provider, key, action, success: false, metadata: { reasonCode } });
  }

  private decrypt(provider: IntegrationProvider, key: string, encrypted: string): string {
    return decryptIntegrationSecret(encrypted, integrationSecretContext(provider, key), this.encryptionKey());
  }

  private async resolveProvider(provider: IntegrationProvider, actor?: IntegrationSettingsActor): Promise<ResolvedIntegrationProvider> {
    const cached = this.cache.get(provider);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    let records: IntegrationSettingRecord[] = [];
    let databaseAvailable = true;
    try {
      records = await this.repository.listByProvider(provider);
    } catch {
      databaseAvailable = false;
    }

    const stateRecord = records.find((row) => row.key === PROVIDER_STATE_KEY) ?? null;
    const providerEnabled = stateRecord?.enabled ?? true;
    const fields: ResolvedIntegrationField[] = [];

    for (const field of getProviderDefinition(provider).fields) {
      const record = databaseAvailable ? records.find((row) => row.key === field.key) ?? null : null;
      if (!record) {
        const envValue = trimEnvValue(this.env[field.envKey]);
        fields.push({ definition: field, record: null, configured: !!envValue, enabled: true, value: envValue, source: envValue ? "ENVIRONMENT" : "NONE", decryptionFailed: false });
        continue;
      }
      if (!record.enabled) {
        fields.push({ definition: field, record, configured: false, enabled: false, value: null, source: "DATABASE", decryptionFailed: false });
        continue;
      }
      if (field.secret && record.encryptedValue) {
        try {
          fields.push({ definition: field, record, configured: true, enabled: true, value: this.decrypt(provider, field.key, record.encryptedValue), source: "DATABASE", decryptionFailed: false });
        } catch (error) {
          const code = error instanceof IntegrationEncryptionError ? error.code : "DECRYPTION_FAILED";
          if (actor) await this.auditFailure(actor, provider, field.key, "INTEGRATION_SETTING_DECRYPT_FAILED", code);
          fields.push({ definition: field, record, configured: false, enabled: true, value: null, source: "DATABASE", decryptionFailed: true });
        }
        continue;
      }
      if (!field.secret && record.plainValue?.trim()) {
        fields.push({ definition: field, record, configured: true, enabled: true, value: record.plainValue.trim(), source: "DATABASE", decryptionFailed: false });
        continue;
      }
      const envValue = trimEnvValue(this.env[field.envKey]);
      fields.push({ definition: field, record, configured: !!envValue, enabled: true, value: envValue, source: envValue ? "ENVIRONMENT" : "NONE", decryptionFailed: false });
    }

    const resolved = { provider, enabled: providerEnabled, databaseAvailable, stateRecord, records, fields };
    this.cache.set(provider, { expiresAt: Date.now() + this.cacheTtlMs, value: resolved });
    return resolved;
  }

  async getActiveRuntimeResolution(provider: IntegrationProvider, actor?: IntegrationSettingsActor): Promise<ActiveRuntimeResolution> {
    const resolved = await this.resolveProvider(provider, actor);
    return {
      provider,
      enabled: resolved.enabled,
      databaseAvailable: resolved.databaseAvailable,
      values: Object.fromEntries(resolved.fields.filter((field) => field.configured && field.value).map((field) => [field.definition.key, field.value as string])),
      sources: Object.fromEntries(resolved.fields.map((field) => [field.definition.key, field.source])),
      missingRequiredFields: resolved.fields.filter((field) => field.definition.required && !field.configured).map((field) => field.definition.key),
      decryptionFailedFields: resolved.fields.filter((field) => field.decryptionFailed).map((field) => field.definition.key),
    };
  }

  async getCandidateConfiguration(provider: IntegrationProvider, actor?: IntegrationSettingsActor): Promise<IntegrationCandidateConfiguration> {
    const resolved = await this.resolveProvider(provider, actor);
    const candidateVersion = resolved.stateRecord?.candidateVersion ?? null;
    const values: Record<string, string> = {};
    const sources: IntegrationCandidateConfiguration["sources"] = {};
    const missingRequiredFields: string[] = [];

    for (const field of getProviderDefinition(provider).fields) {
      const record = resolved.records.find((row) => row.key === field.key) ?? null;
      let value: string | null = null;
      if (candidateVersion && record?.pendingCandidateVersion === candidateVersion) {
        try {
          value = field.secret && record.pendingEncryptedValue
            ? this.decrypt(provider, field.key, record.pendingEncryptedValue)
            : record.pendingPlainValue?.trim() || null;
        } catch (error) {
          const code = error instanceof IntegrationEncryptionError ? error.code : "DECRYPTION_FAILED";
          if (actor) await this.auditFailure(actor, provider, field.key, "INTEGRATION_CANDIDATE_DECRYPT_FAILED", code);
          throw new IntegrationSettingsError(code, "Unable to decrypt candidate integration value");
        }
        if (value) sources[field.key] = "CANDIDATE";
      }
      if (!value) {
        const active = resolved.fields.find((item) => item.definition.key === field.key);
        value = active?.value ?? null;
        sources[field.key] = active?.source ?? "NONE";
      }
      if (value) values[field.key] = value;
      else if (field.required) missingRequiredFields.push(field.key);
    }

    return {
      provider,
      candidateVersion,
      hasPendingChanges: !!candidateVersion && resolved.records.some((row) => row.pendingCandidateVersion === candidateVersion && recordHasPendingValue(row)),
      values,
      sources,
      missingRequiredFields,
    };
  }

  async getProviderSnapshot(provider: IntegrationProvider, actor?: IntegrationSettingsActor): Promise<SafeIntegrationProviderSnapshot> {
    const resolved = await this.resolveProvider(provider, actor);
    const definition = getProviderDefinition(provider);
    const missingRequiredFields = resolved.fields.filter((field) => field.definition.required && !field.configured).map((field) => field.definition.key);
    const hasDecryptionError = resolved.fields.some((field) => field.decryptionFailed);
    const state = resolved.stateRecord;
    const candidateVersion = state?.candidateVersion ?? null;
    return {
      provider,
      labelAr: definition.labelAr,
      enabled: resolved.enabled,
      status: !resolved.enabled ? "DISABLED" : hasDecryptionError ? "ERROR" : missingRequiredFields.length === 0 ? "READY" : "NOT_CONFIGURED",
      encryptionKeyConfigured: integrationEncryptionKeyIsConfigured(this.encryptionKey()),
      missingRequiredFields,
      candidate: {
        version: candidateVersion,
        hasChanges: !!candidateVersion && resolved.records.some((row) => row.pendingCandidateVersion === candidateVersion && recordHasPendingValue(row)),
        createdAt: state?.candidateCreatedAt?.toISOString() ?? null,
        lastTestAt: state?.candidateLastTestAt?.toISOString() ?? null,
        lastTestResult: isTestResult(state?.candidateLastTestResult ?? null) ? state!.candidateLastTestResult as IntegrationTestResult : null,
        lastFailureReasonSafe: state?.candidateFailureReasonSafe ?? null,
      },
      fields: resolved.fields.map((field) => ({
        key: field.definition.key,
        labelAr: field.definition.labelAr,
        isSecret: field.definition.secret,
        required: field.definition.required,
        configured: field.configured,
        enabled: field.enabled,
        maskedValue: field.definition.secret ? maskIntegrationValue(field.value) : null,
        displayValue: field.definition.secret ? null : field.value,
        source: field.source,
        version: field.record?.version ?? null,
        hasPendingValue: !!candidateVersion && field.record?.pendingCandidateVersion === candidateVersion && recordHasPendingValue(field.record),
        pendingVersion: field.record?.pendingVersion ?? null,
        pendingCandidateVersion: field.record?.pendingCandidateVersion ?? null,
        pendingCreatedAt: field.record?.pendingCreatedAt?.toISOString() ?? null,
        updatedAt: field.record?.updatedAt.toISOString() ?? null,
        updatedBy: field.record?.updatedBy ?? null,
        lastTestAt: field.record?.lastTestAt?.toISOString() ?? null,
        lastTestResult: isTestResult(field.record?.lastTestResult ?? null) ? field.record!.lastTestResult as IntegrationTestResult : null,
        lastFailureReasonSafe: field.record?.lastFailureReasonSafe ?? null,
      })),
    };
  }

  async getResolvedValue(provider: IntegrationProvider, key: string, actor?: IntegrationSettingsActor): Promise<string | null> {
    if (!getFieldDefinition(provider, key)) throw new IntegrationSettingsError("UNKNOWN_FIELD", "Unknown integration setting field");
    const resolved = await this.resolveProvider(provider, actor);
    if (!resolved.enabled) return null;
    return resolved.fields.find((item) => item.definition.key === key)?.value ?? null;
  }

  async getResolvedProviderValues(provider: IntegrationProvider, actor?: IntegrationSettingsActor): Promise<Record<string, string>> {
    const resolved = await this.resolveProvider(provider, actor);
    if (!resolved.enabled) return {};
    return Object.fromEntries(resolved.fields.filter((field) => field.configured && field.value).map((field) => [field.definition.key, field.value as string]));
  }
}
