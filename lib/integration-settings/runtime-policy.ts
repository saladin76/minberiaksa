export const ACTIVE_RUNTIME_POLICY_FAILURE = {
  PROVIDER_DISABLED: "PROVIDER_DISABLED",
  PROVIDER_NOT_CONFIGURED: "PROVIDER_NOT_CONFIGURED",
  INTEGRATION_DATABASE_UNAVAILABLE: "INTEGRATION_DATABASE_UNAVAILABLE",
  INTEGRATION_DECRYPTION_FAILED: "INTEGRATION_DECRYPTION_FAILED",
} as const;

export type ActiveRuntimePolicyFailure =
  (typeof ACTIVE_RUNTIME_POLICY_FAILURE)[keyof typeof ACTIVE_RUNTIME_POLICY_FAILURE];

export type ActiveRuntimePolicyInput = {
  enabled: boolean;
  databaseAvailable: boolean;
  values: Record<string, string>;
  decryptionFailedFields: string[];
  requiredFields: readonly string[];
  allowDisabled?: boolean;
  allowDatabaseFallback?: boolean;
};

export type ActiveRuntimePolicyDecision =
  | { configured: true; reason: null; missingFields: [] }
  | { configured: false; reason: ActiveRuntimePolicyFailure; missingFields: string[] };

export function evaluateActiveRuntimePolicy(
  input: ActiveRuntimePolicyInput
): ActiveRuntimePolicyDecision {
  if (input.decryptionFailedFields.length > 0) {
    return {
      configured: false,
      reason: ACTIVE_RUNTIME_POLICY_FAILURE.INTEGRATION_DECRYPTION_FAILED,
      missingFields: [...input.decryptionFailedFields],
    };
  }

  if (!input.databaseAvailable && !input.allowDatabaseFallback) {
    return {
      configured: false,
      reason: ACTIVE_RUNTIME_POLICY_FAILURE.INTEGRATION_DATABASE_UNAVAILABLE,
      missingFields: [],
    };
  }

  if (!input.allowDisabled && !input.enabled) {
    return {
      configured: false,
      reason: ACTIVE_RUNTIME_POLICY_FAILURE.PROVIDER_DISABLED,
      missingFields: [],
    };
  }

  const missingFields = input.requiredFields.filter((key) => !input.values[key]);
  if (missingFields.length > 0) {
    return {
      configured: false,
      reason: ACTIVE_RUNTIME_POLICY_FAILURE.PROVIDER_NOT_CONFIGURED,
      missingFields,
    };
  }

  return { configured: true, reason: null, missingFields: [] };
}
