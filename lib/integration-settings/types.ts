import type {
  IntegrationProvider,
  IntegrationTestResult,
  IntegrationValueSource,
} from "./catalog";
import type { IntegrationEncryptionError } from "./crypto";

export type IntegrationSettingRecord = {
  id: string;
  provider: string;
  key: string;
  encryptedValue: string | null;
  plainValue: string | null;
  isSecret: boolean;
  enabled: boolean;
  version: number;
  source: string;
  pendingEncryptedValue: string | null;
  pendingPlainValue: string | null;
  pendingVersion: number | null;
  pendingCandidateVersion: string | null;
  pendingCreatedAt: Date | null;
  pendingUpdatedBy: string | null;
  candidateVersion: string | null;
  candidateCreatedAt: Date | null;
  candidateLastTestVersion: string | null;
  candidateLastTestAt: Date | null;
  candidateLastTestResult: string | null;
  candidateFailureReasonSafe: string | null;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: string | null;
  lastTestAt: Date | null;
  lastTestResult: string | null;
  lastFailureReasonSafe: string | null;
};

export type IntegrationSettingCreateData = Omit<
  IntegrationSettingRecord,
  "id" | "createdAt" | "updatedAt"
>;

export type IntegrationSettingPatch = Partial<
  Omit<
    IntegrationSettingRecord,
    "id" | "provider" | "key" | "createdAt" | "updatedAt"
  >
>;

export type IntegrationSettingMutation =
  | { type: "CREATE"; data: IntegrationSettingCreateData }
  | {
      type: "UPDATE";
      provider: IntegrationProvider;
      key: string;
      patch: IntegrationSettingPatch;
    }
  | { type: "DELETE"; provider: IntegrationProvider; key: string };

export type CandidateTestStatePatch = {
  candidateLastTestVersion: string;
  candidateLastTestAt: Date;
  candidateLastTestResult: IntegrationTestResult;
  candidateFailureReasonSafe: string | null;
};

export type CandidateActivationResult =
  | { status: "ACTIVATED"; activatedFields: number }
  | { status: "CANDIDATE_NOT_FOUND" }
  | { status: "VERSION_MISMATCH" }
  | { status: "NOT_VERIFIED" }
  | { status: "EMPTY_CANDIDATE" };

export type CandidateDiscardResult =
  | { status: "DISCARDED"; discardedFields: number }
  | { status: "CANDIDATE_NOT_FOUND" }
  | { status: "VERSION_MISMATCH" };

export interface IntegrationSettingsRepository {
  listByProvider(provider: IntegrationProvider): Promise<IntegrationSettingRecord[]>;
  applyMutations(
    mutations: readonly IntegrationSettingMutation[]
  ): Promise<IntegrationSettingRecord[]>;
  recordCandidateTestResult(
    provider: IntegrationProvider,
    candidateVersion: string,
    patch: CandidateTestStatePatch
  ): Promise<boolean>;
  activateCandidateAtomically(
    provider: IntegrationProvider,
    candidateVersion: string,
    actorId: string
  ): Promise<CandidateActivationResult>;
  discardCandidateAtomically(
    provider: IntegrationProvider,
    candidateVersion: string
  ): Promise<CandidateDiscardResult>;
}

export type IntegrationSettingsActor = {
  actorId: string;
  actorName?: string | null;
  actorRole: string;
};

export type IntegrationSettingsAuditEntry = {
  actor: IntegrationSettingsActor;
  action: string;
  provider: IntegrationProvider;
  key?: string;
  success: boolean;
  metadata?: Record<string, string | number | boolean | null | string[]>;
};

export interface IntegrationSettingsAuditWriter {
  write(entry: IntegrationSettingsAuditEntry): Promise<void>;
}

export type IntegrationSettingInput = { key: string; value: string };
export type IntegrationSettingSaveResult = {
  key: string;
  action: "STAGED" | "UNCHANGED";
};

export type SafeIntegrationField = {
  key: string;
  labelAr: string;
  isSecret: boolean;
  required: boolean;
  configured: boolean;
  enabled: boolean;
  maskedValue: string | null;
  displayValue: string | null;
  source: IntegrationValueSource;
  version: number | null;
  hasPendingValue: boolean;
  pendingVersion: number | null;
  pendingCandidateVersion: string | null;
  pendingCreatedAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  lastTestAt: string | null;
  lastTestResult: IntegrationTestResult | null;
  lastFailureReasonSafe: string | null;
};

export type SafeIntegrationCandidate = {
  version: string | null;
  hasChanges: boolean;
  createdAt: string | null;
  lastTestAt: string | null;
  lastTestResult: IntegrationTestResult | null;
  lastFailureReasonSafe: string | null;
};

export type SafeIntegrationProviderSnapshot = {
  provider: IntegrationProvider;
  labelAr: string;
  enabled: boolean;
  status: "READY" | "NOT_CONFIGURED" | "DISABLED" | "ERROR";
  encryptionKeyConfigured: boolean;
  missingRequiredFields: string[];
  candidate: SafeIntegrationCandidate;
  fields: SafeIntegrationField[];
};

export type CandidateValueSource = IntegrationValueSource | "CANDIDATE";

export type IntegrationCandidateConfiguration = {
  provider: IntegrationProvider;
  candidateVersion: string | null;
  hasPendingChanges: boolean;
  values: Record<string, string>;
  sources: Record<string, CandidateValueSource>;
  missingRequiredFields: string[];
};

export type ProviderConnectionTestInput = {
  provider: IntegrationProvider;
  values: Readonly<Record<string, string>>;
  candidateVersion: string | null;
};

export type ProviderConnectionTestResult = {
  success: boolean;
  connectionStatus: "CONNECTED" | "FAILED" | "NOT_CONFIGURED";
  messageAr: string;
  failureCode: string | null;
};

export interface IntegrationProviderTester {
  test(input: ProviderConnectionTestInput): Promise<ProviderConnectionTestResult>;
}

export type SafeProviderConnectionTestResponse = ProviderConnectionTestResult & {
  provider: IntegrationProvider;
  testedAt: string;
  candidateVersion: string | null;
  missingRequiredFields: string[];
};

export type IntegrationSettingsServiceOptions = {
  env?: NodeJS.ProcessEnv;
  cacheTtlMs?: number;
  now?: () => Date;
  encryptionKey?: () => string | undefined;
  candidateVersion?: () => string;
  providerTester?: IntegrationProviderTester;
};

export type IntegrationSettingsErrorCode =
  | "UNKNOWN_FIELD"
  | "INVALID_FIELD_VALUE"
  | "DUPLICATE_FIELD"
  | "REPOSITORY_FAILURE"
  | "SETTING_NOT_FOUND"
  | "CANDIDATE_NOT_FOUND"
  | "CANDIDATE_NOT_VERIFIED"
  | "CANDIDATE_VERSION_MISMATCH"
  | "CANDIDATE_CHANGED_DURING_TEST"
  | "EMPTY_CANDIDATE"
  | "INVALID_PROVIDER_STATE";

export class IntegrationSettingsError extends Error {
  readonly code: IntegrationSettingsErrorCode | IntegrationEncryptionError["code"];

  constructor(
    code: IntegrationSettingsErrorCode | IntegrationEncryptionError["code"],
    message: string
  ) {
    super(message);
    this.name = "IntegrationSettingsError";
    this.code = code;
  }
}
