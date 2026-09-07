import "server-only";
import type { IntegrationValueSource } from "@/lib/integration-settings/catalog";
import { getActiveIntegrationRuntimeResolution } from "@/lib/integration-settings/prisma-service";
import { evaluateActiveRuntimePolicy } from "@/lib/integration-settings/runtime-policy";

export const RUNTIME_CONFIGURATION_CACHE_MAX_AGE_MS = 30_000;

export const RUNTIME_FAILURE = {
  PROVIDER_DISABLED: "PROVIDER_DISABLED",
  PROVIDER_NOT_CONFIGURED: "PROVIDER_NOT_CONFIGURED",
  INTEGRATION_DATABASE_UNAVAILABLE: "INTEGRATION_DATABASE_UNAVAILABLE",
  INTEGRATION_DECRYPTION_FAILED: "INTEGRATION_DECRYPTION_FAILED",
  PROVIDER_REQUEST_FAILED: "PROVIDER_REQUEST_FAILED",
  PROVIDER_REJECTED: "PROVIDER_REJECTED",
  SENDER_NOT_CONFIGURED: "SENDER_NOT_CONFIGURED",
} as const;

export type RuntimeFailureReason = (typeof RUNTIME_FAILURE)[keyof typeof RUNTIME_FAILURE];
export type RuntimeSources = Record<string, IntegrationValueSource>;

type Ready<T> = {
  configured: true;
  enabled: boolean;
  values: T;
  sources: RuntimeSources;
  databaseAvailable: boolean;
  reason: null;
};

type NotReady = {
  configured: false;
  enabled: boolean;
  values: null;
  sources: RuntimeSources;
  databaseAvailable: boolean;
  reason: RuntimeFailureReason;
  missingFields: string[];
};

export type ActiveRuntimeConfig<T> = Ready<T> | NotReady;

type RuntimeOptions = {
  allowDisabled?: boolean;
  allowDatabaseFallback?: boolean;
};

async function resolve<T extends Record<string, string>>(
  provider: "META_WHATSAPP" | "ELASTIC_EMAIL" | "BREVO" | "NETGSM",
  required: readonly string[],
  select: (values: Record<string, string>) => T,
  options: RuntimeOptions = {}
): Promise<ActiveRuntimeConfig<T>> {
  const state = await getActiveIntegrationRuntimeResolution(provider);
  const decision = evaluateActiveRuntimePolicy({
    enabled: state.enabled,
    databaseAvailable: state.databaseAvailable,
    values: state.values,
    decryptionFailedFields: state.decryptionFailedFields,
    requiredFields: required,
    allowDisabled: options.allowDisabled,
    allowDatabaseFallback: options.allowDatabaseFallback,
  });

  if (!decision.configured) {
    return {
      configured: false,
      enabled: state.enabled,
      values: null,
      sources: state.sources,
      databaseAvailable: state.databaseAvailable,
      reason: decision.reason,
      missingFields: decision.missingFields,
    };
  }

  return {
    configured: true,
    enabled: state.enabled,
    values: select(state.values),
    sources: state.sources,
    databaseAvailable: state.databaseAvailable,
    reason: null,
  };
}

export type MetaWhatsappRuntimeValues = {
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  businessAccountId: string;
  defaultPhoneNumberId: string;
  graphVersion: string;
};

const metaValues = (v: Record<string, string>): MetaWhatsappRuntimeValues => ({
  accessToken: v.ACCESS_TOKEN,
  appSecret: v.APP_SECRET,
  verifyToken: v.WEBHOOK_VERIFY_TOKEN,
  businessAccountId: v.BUSINESS_ACCOUNT_ID,
  defaultPhoneNumberId: v.DEFAULT_PHONE_NUMBER_ID,
  graphVersion: v.GRAPH_API_VERSION,
});

export function getActiveMetaWhatsappRuntimeConfig(): Promise<ActiveRuntimeConfig<MetaWhatsappRuntimeValues>> {
  return resolve("META_WHATSAPP", ["ACCESS_TOKEN", "APP_SECRET", "WEBHOOK_VERIFY_TOKEN", "BUSINESS_ACCOUNT_ID", "DEFAULT_PHONE_NUMBER_ID", "GRAPH_API_VERSION"], metaValues);
}

export function getActiveMetaWebhookConfig(): Promise<ActiveRuntimeConfig<Pick<MetaWhatsappRuntimeValues, "appSecret" | "verifyToken">>> {
  return resolve(
    "META_WHATSAPP",
    ["APP_SECRET", "WEBHOOK_VERIFY_TOKEN"],
    (v) => ({ appSecret: v.APP_SECRET, verifyToken: v.WEBHOOK_VERIFY_TOKEN }),
    { allowDisabled: true, allowDatabaseFallback: true }
  );
}

export type ElasticEmailRuntimeValues = { apiKey: string; senderEmail: string; senderName: string };
export function getActiveElasticEmailRuntimeConfig(): Promise<ActiveRuntimeConfig<ElasticEmailRuntimeValues>> {
  return resolve("ELASTIC_EMAIL", ["API_KEY", "SENDER_EMAIL"], (v) => ({ apiKey: v.API_KEY, senderEmail: v.SENDER_EMAIL, senderName: v.SENDER_NAME ?? "" }));
}

export function getActiveElasticEmailWebhookSecret(): Promise<ActiveRuntimeConfig<{ secret: string }>> {
  return resolve(
    "ELASTIC_EMAIL",
    ["WEBHOOK_SECRET"],
    (v) => ({ secret: v.WEBHOOK_SECRET }),
    { allowDisabled: true, allowDatabaseFallback: true }
  );
}

export type BrevoSmsRuntimeValues = { apiKey: string; sender: string };
export function getActiveBrevoSmsRuntimeConfig(): Promise<ActiveRuntimeConfig<BrevoSmsRuntimeValues>> {
  return resolve("BREVO", ["API_KEY", "SMS_SENDER"], (v) => ({ apiKey: v.API_KEY, sender: v.SMS_SENDER }));
}

export type NetgsmRuntimeValues = { usercode: string; password: string; header: string };
export function getActiveNetgsmRuntimeConfig(): Promise<ActiveRuntimeConfig<NetgsmRuntimeValues>> {
  return resolve("NETGSM", ["USERCODE", "PASSWORD", "HEADER"], (v) => ({ usercode: v.USERCODE, password: v.PASSWORD, header: v.HEADER }));
}

export function getActiveBrevoWebhookSecret(): Promise<ActiveRuntimeConfig<{ secret: string }>> {
  return resolve(
    "BREVO",
    ["WEBHOOK_SECRET"],
    (v) => ({ secret: v.WEBHOOK_SECRET }),
    { allowDisabled: true, allowDatabaseFallback: true }
  );
}

export type CommunicationRuntimeBundle = {
  meta: ActiveRuntimeConfig<MetaWhatsappRuntimeValues>;
  elasticEmail: ActiveRuntimeConfig<ElasticEmailRuntimeValues>;
  brevoSms: ActiveRuntimeConfig<BrevoSmsRuntimeValues>;
  netgsm: ActiveRuntimeConfig<NetgsmRuntimeValues>;
};

export async function getActiveCommunicationRuntimeBundle(): Promise<CommunicationRuntimeBundle> {
  const [meta, elasticEmail, brevoSms, netgsm] = await Promise.all([
    getActiveMetaWhatsappRuntimeConfig(),
    getActiveElasticEmailRuntimeConfig(),
    getActiveBrevoSmsRuntimeConfig(),
    getActiveNetgsmRuntimeConfig(),
  ]);
  return { meta, elasticEmail, brevoSms, netgsm };
}
