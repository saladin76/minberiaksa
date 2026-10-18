import type { IntegrationProvider } from "./catalog";
import { getProviderDefinition } from "./catalog";
import { evaluateProviderReadiness, type ProviderRuntimeState } from "./runtime-policy";
import type {
  IntegrationProviderTester,
  IntegrationSettingsActor,
  ProviderConnectionTestResult,
  SafeProviderConnectionTestResponse,
} from "./types";

export type ActiveTestCoreDependencies = {
  /**
   * The full runtime state (`getActiveRuntimeResolution`), never a bare value map: a disabled
   * provider, an unreadable database and a value that fails to decrypt must each stay
   * distinguishable from a field that is genuinely empty.
   */
  resolveActiveRuntime: (provider: IntegrationProvider, actor: IntegrationSettingsActor) => Promise<ProviderRuntimeState>;
  tester: IntegrationProviderTester;
  record: (provider: IntegrationProvider, testedAt: Date, result: ProviderConnectionTestResult, actorId: string) => Promise<void>;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
};

export function evaluateCronInfrastructure(env: NodeJS.ProcessEnv): ProviderConnectionTestResult {
  const secret = env.CRON_SECRET;
  if (!secret) return { success: false, connectionStatus: "NOT_CONFIGURED", messageAr: "مفتاح Cron غير مضبوط في إعدادات السيرفر.", failureCode: "CRON_SECRET_MISSING" };
  if (secret.length < 32 || /[\r\n]/.test(secret)) return { success: false, connectionStatus: "FAILED", messageAr: "مفتاح Cron لا يحقق متطلبات الأمان.", failureCode: "CRON_SECRET_INVALID" };
  return { success: true, connectionStatus: "CONNECTED", messageAr: "حماية Route الجدولة مضبوطة داخل البنية التحتية، ولم يتم تشغيل أي حملة.", failureCode: null };
}

/**
 * "Check current settings". Readiness comes from `evaluateProviderReadiness`  the verdict the
 * send path and sender verification use  so this check can only pass when sending could, and
 * fails with the same reason they would. Only a ready provider is tested against the provider.
 */
export async function runActiveProviderTest(
  provider: IntegrationProvider,
  actor: IntegrationSettingsActor,
  dependencies: ActiveTestCoreDependencies
): Promise<SafeProviderConnectionTestResponse> {
  const testedAt = (dependencies.now ?? (() => new Date()))();
  let result: ProviderConnectionTestResult;
  let missingRequiredFields: string[] = [];

  if (provider === "SYSTEM") {
    result = evaluateCronInfrastructure(dependencies.env ?? process.env);
  } else {
    let state: ProviderRuntimeState | null = null;
    try {
      state = await dependencies.resolveActiveRuntime(provider, actor);
    } catch {
      state = null;
    }
    const required = getProviderDefinition(provider).fields.filter((field) => field.required).map((field) => field.key);
    const readiness = state
      ? evaluateProviderReadiness(state, required)
      : evaluateProviderReadiness({ enabled: true, databaseAvailable: false, values: {}, decryptionFailedFields: [] }, required);
    if (!readiness.ready) {
      missingRequiredFields = readiness.missingFields;
      result = { success: false, connectionStatus: readiness.connectionStatus, messageAr: readiness.messageAr, failureCode: readiness.failureCode };
    } else {
      try { result = await dependencies.tester.test({ provider, values: state!.values, candidateVersion: null }); }
      catch { result = { success: false, connectionStatus: "FAILED", messageAr: "تعذر تنفيذ فحص الإعدادات الحالية.", failureCode: "PROVIDER_TEST_REQUEST_FAILED" }; }
    }
  }

  await dependencies.record(provider, testedAt, result, actor.actorId);
  return { ...result, provider, testedAt: testedAt.toISOString(), candidateVersion: null, missingRequiredFields };
}
