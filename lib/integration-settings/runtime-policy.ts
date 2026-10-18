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

/**
 * The failure code a dashboard check stores and shows for each policy outcome. A missing field
 * keeps its long-standing code (`MISSING_REQUIRED_FIELDS`); every other outcome is named for
 * what it is, so a disabled provider is never reported as missing data.
 */
export const READINESS_FAILURE_CODE: Record<ActiveRuntimePolicyFailure, string> = {
  PROVIDER_DISABLED: "PROVIDER_DISABLED",
  PROVIDER_NOT_CONFIGURED: "MISSING_REQUIRED_FIELDS",
  INTEGRATION_DATABASE_UNAVAILABLE: "INTEGRATION_DATABASE_UNAVAILABLE",
  INTEGRATION_DECRYPTION_FAILED: "INTEGRATION_DECRYPTION_FAILED",
};

/** What `getActiveRuntimeResolution()` hands over: state, values and where each came from. */
export type ProviderRuntimeState = {
  enabled: boolean;
  databaseAvailable: boolean;
  values: Record<string, string>;
  decryptionFailedFields: string[];
};

export type ProviderReadiness =
  | { ready: true; failureCode: null; reason: null; missingFields: [] }
  | {
      ready: false;
      failureCode: string;
      reason: ActiveRuntimePolicyFailure;
      /** Required fields with no value  only when the reason is a real gap, never for a disabled provider. */
      missingFields: string[];
      connectionStatus: "NOT_CONFIGURED" | "FAILED";
      messageAr: string;
    };

const READINESS_MESSAGE_AR: Record<ActiveRuntimePolicyFailure, string> = {
  PROVIDER_DISABLED: "المزوّد معطّل داخل النظام. البيانات محفوظة ولن تُستخدم حتى يُعاد تفعيله.",
  PROVIDER_NOT_CONFIGURED: "بيانات التكوين العامل المطلوبة غير مكتملة.",
  INTEGRATION_DATABASE_UNAVAILABLE: "تعذرت قراءة إعدادات التكامل من قاعدة البيانات.",
  INTEGRATION_DECRYPTION_FAILED: "تعذر فك تشفير قيم محفوظة. تحقق من مفتاح تشفير الإعدادات.",
};

/**
 * The one readiness verdict for a provider, shared by the settings page, the "check current
 * settings" test, sender verification and the send path. It reads the full runtime state
 * enabled flag, database health, decryption failures and values  so each outcome stays
 * distinct instead of collapsing into an empty set of values.
 */
export function evaluateProviderReadiness(
  state: ProviderRuntimeState,
  requiredFields: readonly string[],
  options: { allowDisabled?: boolean; allowDatabaseFallback?: boolean } = {},
): ProviderReadiness {
  const decision = evaluateActiveRuntimePolicy({ ...state, requiredFields, ...options });
  if (decision.configured) return { ready: true, failureCode: null, reason: null, missingFields: [] };
  return {
    ready: false,
    failureCode: READINESS_FAILURE_CODE[decision.reason],
    reason: decision.reason,
    missingFields: decision.reason === "PROVIDER_NOT_CONFIGURED" ? decision.missingFields : [],
    connectionStatus: decision.reason === "PROVIDER_NOT_CONFIGURED" ? "NOT_CONFIGURED" : "FAILED",
    messageAr: READINESS_MESSAGE_AR[decision.reason],
  };
}
