import type { IntegrationValueSource } from "./catalog";
import type {
  IntegrationSettingCreateData,
  IntegrationSettingPatch,
  IntegrationSettingRecord,
} from "./types";

export const PROVIDER_STATE_KEY = "__PROVIDER_STATE__";
export const DEFAULT_CACHE_TTL_MS = 30_000;

export function trimEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function safeFailureCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const candidate = value.trim().toUpperCase();
  return /^[A-Z][A-Z0-9:_-]{0,95}$/.test(candidate)
    ? candidate
    : "PROVIDER_TEST_FAILED";
}

export function createDataToPatch(
  data: IntegrationSettingCreateData
): IntegrationSettingPatch {
  const { provider: _provider, key: _key, ...patch } = data;
  return patch;
}

export function recordHasPendingValue(
  record: IntegrationSettingRecord | null
): boolean {
  return !!(
    record?.pendingEncryptedValue ||
    record?.pendingPlainValue ||
    record?.pendingVersion ||
    record?.pendingCandidateVersion
  );
}

export function sourceBeforeWrite(
  record: IntegrationSettingRecord | null,
  envValue: string | null
): IntegrationValueSource {
  if (record && (record.encryptedValue || record.plainValue)) return "DATABASE";
  return envValue ? "ENVIRONMENT" : "NONE";
}
