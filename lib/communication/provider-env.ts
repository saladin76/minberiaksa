/**
 * Server-only provider configuration readiness. Reads the official env vars for the finalized
 * Communication provider architecture and reports whether each provider is configured + which env
 * keys are missing — WITHOUT ever returning a secret value. Safe to surface to readiness UIs via an
 * operations-guarded API (only booleans + missing key NAMES + a safe label leave this module).
 *
 * Final architecture: WhatsApp = Meta, Email = Elastic Email, SMS int'l = Brevo, SMS Turkey = Netgsm,
 * Brevo Email / Twilio / SendGrid = legacy disabled.
 */

const has = (k: string) => !!process.env[k]?.trim();
function missingOf(required: string[]): string[] {
  return required.filter((k) => !has(k));
}

export type ProviderConfigStatus = {
  configured: boolean;
  missing: string[];
  safeLabel: string;
};

/** Meta WhatsApp Cloud API. */
export function getMetaWhatsappConfig(): ProviderConfigStatus {
  // Access token + business account id are the minimum to operate; graph version has a default.
  const required = ["META_WHATSAPP_ACCESS_TOKEN", "META_WHATSAPP_BUSINESS_ACCOUNT_ID"];
  const missing = missingOf(required);
  return { configured: missing.length === 0, missing, safeLabel: "Meta WhatsApp" };
}

/** Elastic Email transactional email (primary — and only — email provider). */
export function getElasticEmailConfig(): ProviderConfigStatus {
  const required = ["ELASTIC_EMAIL_API_KEY", "ELASTIC_EMAIL_SENDER_EMAIL"];
  const missing = missingOf(required);
  return { configured: missing.length === 0, missing, safeLabel: "Elastic Email" };
}

/** Brevo transactional SMS (international / non-Turkish numbers). */
export function getBrevoSmsConfig(): ProviderConfigStatus {
  const required = ["BREVO_API_KEY", "BREVO_SMS_SENDER"];
  const missing = missingOf(required);
  return { configured: missing.length === 0, missing, safeLabel: "Brevo SMS" };
}

/** Netgsm SMS (Turkish numbers only). */
export function getNetgsmSmsConfig(): ProviderConfigStatus {
  const required = ["NETGSM_USERCODE", "NETGSM_PASSWORD", "NETGSM_HEADER"];
  const missing = missingOf(required);
  return { configured: missing.length === 0, missing, safeLabel: "Netgsm SMS" };
}

/** Legacy Twilio — kept for reference only; NEVER used by an active send path. */
export function getLegacyTwilioConfig(): ProviderConfigStatus & { legacy: true; active: false } {
  const required = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"];
  const missing = missingOf(required);
  return { configured: missing.length === 0, missing, safeLabel: "Twilio (قديم)", legacy: true, active: false };
}

/** Optional default WhatsApp phone number id (multi-number routing prefers the sender's own id). */
export function metaDefaultPhoneNumberId(): string | null {
  return process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim() || null;
}

/** Brevo default SMS type (transactional | marketing); defaults to transactional. */
export function brevoSmsDefaultType(): "transactional" | "marketing" {
  return process.env.BREVO_SMS_DEFAULT_TYPE?.trim() === "marketing" ? "marketing" : "transactional";
}
