import type { CommunicationProviderKey, ProviderConnection } from "./communication-types";

/* ============================================================================
 * OFFICIAL FINAL PROVIDER REGISTRY — SINGLE SOURCE OF TRUTH
 *
 * Used by: ProviderRouter, settings/readiness UI, platform-connections page, provider test tools,
 * and docs. Inactive/legacy providers (Twilio, SendGrid) must NEVER be shown as normal active
 * options in user-facing UI — surface them only via legacyProviders() under a "قديم" section.
 *
 * FINAL ARCHITECTURE:
 *   WhatsApp → Meta WhatsApp Cloud API   (active)
 *   Email    → Elastic Email              (active)
 *   SMS TR   → Netgsm                     (active)
 *   SMS int'l→ Brevo SMS                  (active)
 *   Brevo Email → LEGACY_DISABLED (replaced by Elastic Email)
 *   Twilio   → LEGACY_DISABLED
 *   SendGrid → LEGACY_DISABLED
 * ==========================================================================*/

export type ProviderChannel = "WHATSAPP" | "EMAIL" | "SMS";
export type ProviderScope = "ALL" | "INTERNATIONAL" | "TR";

export type OfficialProvider = {
  key: string;
  channel: ProviderChannel;
  labelAr: string;
  active: boolean;
  legacy: boolean;
  scope?: ProviderScope;
  status?: "ACTIVE" | "DISABLED";
};

export const PROVIDER_REGISTRY: OfficialProvider[] = [
  // WhatsApp
  { key: "META_WHATSAPP", channel: "WHATSAPP", labelAr: "Meta WhatsApp", active: true, legacy: false, scope: "ALL", status: "ACTIVE" },
  // Email
  { key: "ELASTIC_EMAIL", channel: "EMAIL", labelAr: "Elastic Email", active: true, legacy: false, scope: "ALL", status: "ACTIVE" },
  { key: "BREVO_EMAIL", channel: "EMAIL", labelAr: "Brevo Email", active: false, legacy: true, scope: "ALL", status: "DISABLED" },
  { key: "SENDGRID", channel: "EMAIL", labelAr: "SendGrid", active: false, legacy: true, scope: "ALL", status: "DISABLED" },
  // SMS
  { key: "BREVO_SMS", channel: "SMS", labelAr: "Brevo SMS", active: true, legacy: false, scope: "INTERNATIONAL", status: "ACTIVE" },
  { key: "NETGSM_SMS", channel: "SMS", labelAr: "Netgsm SMS", active: true, legacy: false, scope: "TR", status: "ACTIVE" },
  // Legacy (disabled — never an active send path)
  { key: "TWILIO", channel: "SMS", labelAr: "Twilio", active: false, legacy: true, status: "DISABLED" },
];

/** Active (non-legacy) providers only — the set that user-facing UI may present. */
export function activeProviders(channel?: ProviderChannel): OfficialProvider[] {
  return PROVIDER_REGISTRY.filter((p) => p.active && !p.legacy && (!channel || p.channel === channel));
}

/** Legacy/disabled providers (Twilio, SendGrid) — shown only under a "قديم" section, never active. */
export function legacyProviders(): OfficialProvider[] {
  return PROVIDER_REGISTRY.filter((p) => p.legacy || !p.active);
}

export function providerByKey(key: string): OfficialProvider | undefined {
  return PROVIDER_REGISTRY.find((p) => p.key === key);
}

export function isProviderActive(key: string): boolean {
  const p = providerByKey(key);
  return !!p && p.active && !p.legacy;
}

export const OFFICIAL_PROVIDER_MATRIX = {
  whatsapp: "META_WHATSAPP",
  email: "ELASTIC_EMAIL",
  smsInternational: "BREVO_SMS",
  smsTurkey: "NETGSM_SMS",
  legacyDisabled: ["TWILIO", "SENDGRID", "BREVO_EMAIL"],
} as const;

/* ============================================================================
 * Compatibility export derived from the final provider registry; do not edit separately.
 *
 * Kept only for the older readiness/overview screens (provider-connections readiness,
 * communication-service overview, operations/messaging page) that consumed the previous
 * `ProviderConnection[]` shape. It is derived from PROVIDER_REGISTRY and contains ONLY the active,
 * user-facing providers whose keys are valid `CommunicationProviderKey` values (Meta / Elastic Email /
 * Brevo SMS). The retired `SMS_FALLBACK` pseudo-provider has been removed; Twilio/SendGrid/Brevo Email
 * are never included here (they live in PROVIDER_REGISTRY as legacy-disabled and surface via
 * legacyProviders()).
 * ==========================================================================*/

const COMPAT_KEYS: readonly CommunicationProviderKey[] = ["META_WHATSAPP", "ELASTIC_EMAIL", "BREVO_SMS"];

export const communicationProviderRegistry: ProviderConnection[] = PROVIDER_REGISTRY.filter(
  (p): p is OfficialProvider & { key: CommunicationProviderKey } => (COMPAT_KEYS as readonly string[]).includes(p.key)
).map((p) => ({
  key: p.key,
  channel: p.channel,
  name: p.labelAr,
  status: "NOT_CONFIGURED",
  isPrimary: true,
  supportsTransactional: true,
  supportsMarketing: p.channel !== "SMS",
  notes: null,
}));

export function providerForChannel(channel: ProviderConnection["channel"]) {
  return communicationProviderRegistry.find((provider) => provider.channel === channel && provider.isPrimary);
}
