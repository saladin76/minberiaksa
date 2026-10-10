import type { CommunicationProviderKey, ProviderConnection } from "./communication-types";
import type { CommunicationChannelId } from "./communication-runtime-types";

export type ProviderScope = "ALL" | "INTERNATIONAL" | "TR";

export type OfficialProvider = {
  key: CommunicationProviderKey;
  channel: CommunicationChannelId;
  labelAr: string;
  scope: ProviderScope;
};

/**
 * Active provider matrix only.
 * Historical provider ids are handled by delivery-history parsers, never by active routing/UI.
 */
export const PROVIDER_REGISTRY: readonly OfficialProvider[] = [
  { key: "META_WHATSAPP", channel: "WHATSAPP", labelAr: "Meta WhatsApp", scope: "ALL" },
  { key: "ELASTIC_EMAIL", channel: "EMAIL", labelAr: "Elastic Email", scope: "ALL" },
  { key: "BREVO_SMS", channel: "SMS", labelAr: "Brevo SMS", scope: "INTERNATIONAL" },
  { key: "NETGSM_SMS", channel: "SMS", labelAr: "Netgsm SMS", scope: "TR" },
] as const;

export function activeProviders(channel?: CommunicationChannelId): OfficialProvider[] {
  return PROVIDER_REGISTRY.filter((provider) => !channel || provider.channel === channel);
}

export function providerByKey(key: string): OfficialProvider | undefined {
  return PROVIDER_REGISTRY.find((provider) => provider.key === key);
}

export function isProviderActive(key: string): key is CommunicationProviderKey {
  return Boolean(providerByKey(key));
}

export const OFFICIAL_PROVIDER_MATRIX = {
  whatsapp: "META_WHATSAPP",
  email: "ELASTIC_EMAIL",
  smsInternational: "BREVO_SMS",
  smsTurkey: "NETGSM_SMS",
} as const satisfies Record<string, CommunicationProviderKey>;

export const communicationProviderRegistry: ProviderConnection[] = PROVIDER_REGISTRY.map((provider) => ({
  key: provider.key,
  channel: provider.channel,
  name: provider.labelAr,
  status: "NOT_CONFIGURED",
  isPrimary: true,
  supportsTransactional: true,
  supportsMarketing: true,
  notes:
    provider.key === "NETGSM_SMS"
      ? "تركيا (+90)"
      : provider.key === "BREVO_SMS"
        ? "الرسائل الدولية خارج تركيا"
        : null,
}));

export function providerForChannel(channel: CommunicationChannelId) {
  return communicationProviderRegistry.find((provider) => provider.channel === channel && provider.isPrimary);
}
