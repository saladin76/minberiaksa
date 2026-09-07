import { getCanonicalApplicationUrl } from "./canonical-url";
import { integrationEncryptionKeyIsConfigured } from "./crypto";
import { cronInfrastructureStatus } from "../communication/cron-auth";

export type ReleaseCheckStatus = "PASS" | "WARNING" | "BLOCKED";
export type ReleaseCheck = { id: string; status: ReleaseCheckStatus; message: string };
export type MongoIndexDescription = { name: string; key: Record<string, number>; unique?: boolean };

export const INTEGRATION_SETTING_COLLECTION = "IntegrationSetting";
export const EXPECTED_INTEGRATION_SETTING_INDEXES: readonly MongoIndexDescription[] = [
  { name: "IntegrationSetting_provider_key_unique", key: { provider: 1, key: 1 }, unique: true },
  { name: "IntegrationSetting_provider_enabled_idx", key: { provider: 1, enabled: 1 } },
  { name: "IntegrationSetting_provider_pendingCandidateVersion_idx", key: { provider: 1, pendingCandidateVersion: 1 } },
  { name: "IntegrationSetting_updatedAt_desc_idx", key: { updatedAt: -1 } },
] as const;

export function sameIndexKey(a: Record<string, number>, b: Record<string, number>): boolean {
  return JSON.stringify(Object.entries(a)) === JSON.stringify(Object.entries(b));
}

export function inspectIndexDefinitions(actual: readonly MongoIndexDescription[]): ReleaseCheck[] {
  const checks: ReleaseCheck[] = [];
  for (const expected of EXPECTED_INTEGRATION_SETTING_INDEXES) {
    const named = actual.find((index) => index.name === expected.name);
    if (!named) {
      checks.push({ id: `index:${expected.name}`, status: "BLOCKED", message: `Required index is missing: ${expected.name}` });
      continue;
    }
    if (!sameIndexKey(named.key, expected.key) || Boolean(named.unique) !== Boolean(expected.unique)) {
      checks.push({ id: `index:${expected.name}`, status: "BLOCKED", message: `Index definition conflicts with expected schema: ${expected.name}` });
      continue;
    }
    checks.push({ id: `index:${expected.name}`, status: "PASS", message: `Index is present: ${expected.name}` });
  }
  for (const actualIndex of actual) {
    const expectedByName = EXPECTED_INTEGRATION_SETTING_INDEXES.find((item) => item.name === actualIndex.name);
    const expectedByKey = EXPECTED_INTEGRATION_SETTING_INDEXES.find((item) => sameIndexKey(item.key, actualIndex.key));
    if (!expectedByName && expectedByKey && Boolean(expectedByKey.unique) !== Boolean(actualIndex.unique)) {
      checks.push({ id: `index-conflict:${actualIndex.name}`, status: "BLOCKED", message: `Index key exists with incompatible uniqueness: ${actualIndex.name}` });
    }
  }
  return checks;
}

export function inspectEnvironment(env: NodeJS.ProcessEnv = process.env): ReleaseCheck[] {
  const checks: ReleaseCheck[] = [];
  checks.push({ id: "database-url", status: env.DATABASE_URL?.trim() ? "PASS" : "BLOCKED", message: env.DATABASE_URL?.trim() ? "DATABASE_URL is configured." : "DATABASE_URL is missing." });
  checks.push({ id: "encryption-key", status: integrationEncryptionKeyIsConfigured(env.INTEGRATION_SETTINGS_ENCRYPTION_KEY) ? "PASS" : "BLOCKED", message: integrationEncryptionKeyIsConfigured(env.INTEGRATION_SETTINGS_ENCRYPTION_KEY) ? "Encryption key decodes to exactly 32 bytes." : "Encryption key is missing or does not decode to exactly 32 bytes." });
  const cron = cronInfrastructureStatus(env);
  checks.push({ id: "cron-secret", status: cron.secretValid ? "PASS" : "BLOCKED", message: cron.secretValid ? "CRON_SECRET passes the basic protection contract." : "CRON_SECRET is missing or invalid." });
  try {
    const canonical = getCanonicalApplicationUrl(env);
    const url = new URL(canonical);
    const productionLike = env.VERCEL_ENV === "production" || env.NODE_ENV === "production";
    checks.push({ id: "canonical-url", status: productionLike && url.protocol !== "https:" ? "BLOCKED" : url.protocol === "https:" ? "PASS" : "WARNING", message: url.protocol === "https:" ? "Canonical application URL uses HTTPS." : "Canonical application URL is not HTTPS." });
  } catch {
    checks.push({ id: "canonical-url", status: "BLOCKED", message: "Canonical application URL is missing or invalid." });
  }
  const legacyTwilioEnabled = env.WHATSAPP_LEGACY_TWILIO_ENABLED === "true" || env.TWILIO_LEGACY_ENABLED === "true";
  checks.push({ id: "twilio-legacy", status: legacyTwilioEnabled ? "BLOCKED" : "PASS", message: legacyTwilioEnabled ? "A Twilio legacy flag is enabled." : "Twilio legacy flags are disabled." });
  const sendgridFallbackEnabled = env.SENDGRID_FALLBACK_ENABLED === "true" || env.EMAIL_SENDGRID_ENABLED === "true";
  checks.push({ id: "sendgrid-legacy", status: sendgridFallbackEnabled ? "BLOCKED" : "PASS", message: sendgridFallbackEnabled ? "A SendGrid fallback flag is enabled." : "SendGrid fallback flags are disabled." });
  const canonicalCandidates = [env.APP_URL, env.NEXTAUTH_URL, env.NEXT_PUBLIC_APP_URL, env.NEXT_PUBLIC_SITE_URL].filter((value): value is string => Boolean(value?.trim())).map((value) => new URL(value).origin);
  if (new Set(canonicalCandidates).size > 1) checks.push({ id: "canonical-url-conflict", status: "WARNING", message: "Configured canonical URL variables point to different origins." });
  const metaGraph = env.META_GRAPH_VERSION?.trim();
  if (metaGraph && !/^v\d+(\.\d+)?$/.test(metaGraph)) checks.push({ id: "meta-graph-version", status: "WARNING", message: "META_GRAPH_VERSION has an unexpected format." });
  return checks;
}

export function overallStatus(checks: readonly ReleaseCheck[]): ReleaseCheckStatus {
  if (checks.some((check) => check.status === "BLOCKED")) return "BLOCKED";
  if (checks.some((check) => check.status === "WARNING")) return "WARNING";
  return "PASS";
}
