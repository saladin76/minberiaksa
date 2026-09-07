import { getProviderByKey } from "./provider-catalog";
import type { ProviderCatalogEntry, ProviderKey } from "./provider-types";
import type { PlatformCategory, PlatformKey } from "@/lib/marketing/platform-connection-requirements";

export type ConnectionSectionKey =
  | "PIXELS_AND_APIS"
  | "AD_ANALYTICS"
  | "MESSAGING"
  | "AI"
  | "ARCHIVE_STORAGE"
  | "INTERNAL_API";

export type ProviderConnectionOption = {
  providerKey: ProviderKey;
  platform: PlatformKey;
  category: PlatformCategory;
  section: ConnectionSectionKey;
  uiLabel: string;
  readinessCheck: string;
  surface: "Browser" | "Server" | "Reporting" | "Browser + Server" | "Internal";
};

export const CONNECTION_SECTIONS: Array<{
  key: ConnectionSectionKey;
  label: string;
  description: string;
}> = [
  {
    key: "PIXELS_AND_APIS",
    label: "Pixels & APIs",
    description: "Browser pixels, server conversion APIs, and event delivery contracts.",
  },
  {
    key: "AD_ANALYTICS",
    label: "Ad & Analytics Accounts",
    description: "Ad accounts, analytics properties, campaign snapshots, and reporting sync readiness.",
  },
  {
    key: "MESSAGING",
    label: "Messaging Providers",
    description: "SMS, WhatsApp, and email delivery providers without sending from this page.",
  },
  {
    key: "AI",
    label: "AI Providers",
    description: "Shared AI Core provider contracts. Outputs remain review-only.",
  },
  {
    key: "ARCHIVE_STORAGE",
    label: "Archive / Storage Providers",
    description: "Drive, Picker, storage, and media processing contracts for future Archive work.",
  },
  {
    key: "INTERNAL_API",
    label: "Internal APIs",
    description: "Internal webhook/API contracts and readiness, with no external platform calls.",
  },
];

// Adapter while older platform-meta display data still exists.
// Source of truth: provider catalog key -> MarketingPlatformConnection.platform -> UI section -> readiness contract.
export const PROVIDER_CONNECTION_MAP: ProviderConnectionOption[] = [
  {
    providerKey: "meta",
    platform: "META",
    category: "ADS",
    section: "PIXELS_AND_APIS",
    uiLabel: "Meta Pixel + Conversions API",
    readinessCheck: "Pixel/Dataset ID + server access token + optional ad account for reporting.",
    surface: "Browser + Server",
  },
  {
    providerKey: "google_ads",
    platform: "GOOGLE_ADS",
    category: "ADS",
    section: "AD_ANALYTICS",
    uiLabel: "Google Ads",
    readinessCheck: "Customer ID + developer token + OAuth credentials before reporting sync.",
    surface: "Server",
  },
  {
    providerKey: "ga4",
    platform: "GA4",
    category: "ANALYTICS",
    section: "AD_ANALYTICS",
    uiLabel: "Google Analytics 4",
    readinessCheck: "Measurement ID + API secret for Measurement Protocol; property ID for reporting.",
    surface: "Browser + Server",
  },
  {
    providerKey: "tiktok",
    platform: "TIKTOK",
    category: "ADS",
    section: "PIXELS_AND_APIS",
    uiLabel: "TikTok Pixel + Events API",
    readinessCheck: "Pixel ID + advertiser ID + access token before events/reporting are reliable.",
    surface: "Browser + Server",
  },
  {
    providerKey: "x_ads",
    platform: "X",
    category: "ADS",
    section: "AD_ANALYTICS",
    uiLabel: "X Ads",
    readinessCheck: "Ads account + API access; browser pixel remains separate from financial truth.",
    surface: "Browser + Server",
  },
  {
    providerKey: "twilio",
    platform: "TWILIO",
    category: "MESSAGING",
    section: "MESSAGING",
    uiLabel: "Twilio",
    readinessCheck: "Account SID + auth token. International SMS can use Twilio; Turkey SMS should use Netgsm.",
    surface: "Server",
  },
  {
    providerKey: "netgsm",
    platform: "NETGSM",
    category: "MESSAGING",
    section: "MESSAGING",
    uiLabel: "Netgsm",
    readinessCheck: "Username + password/API secret + approved SMS header for Turkey SMS.",
    surface: "Server",
  },
  {
    providerKey: "email",
    platform: "EMAIL_PROVIDER",
    category: "EMAIL",
    section: "MESSAGING",
    uiLabel: "Email Provider",
    readinessCheck: "Provider name + API key + verified sender or domain.",
    surface: "Server",
  },
  {
    providerKey: "whatsapp",
    platform: "WHATSAPP_PROVIDER",
    category: "MESSAGING",
    section: "MESSAGING",
    uiLabel: "WhatsApp Provider",
    readinessCheck: "Business account, phone number ID, and access token when WhatsApp is selected.",
    surface: "Server",
  },
  {
    providerKey: "twilio",
    platform: "SMS_PROVIDER",
    category: "MESSAGING",
    section: "MESSAGING",
    uiLabel: "Generic SMS Provider",
    readinessCheck: "Use Netgsm for Turkey SMS and Twilio for international SMS before adding a generic SMS route.",
    surface: "Server",
  },
  {
    providerKey: "openai",
    platform: "OPENAI",
    category: "AI",
    section: "AI",
    uiLabel: "OpenAI",
    readinessCheck: "Server-side API key for Shared AI Core only; no automatic publish/send/budget actions.",
    surface: "Server",
  },
  {
    providerKey: "google_drive",
    platform: "GOOGLE_DRIVE",
    category: "ARCHIVE_STORAGE",
    section: "ARCHIVE_STORAGE",
    uiLabel: "Google Drive",
    readinessCheck: "Drive API enabled + OAuth client + refresh token. No Drive sync is enabled here.",
    surface: "Server",
  },
  {
    providerKey: "google_picker",
    platform: "GOOGLE_PICKER",
    category: "ARCHIVE_STORAGE",
    section: "ARCHIVE_STORAGE",
    uiLabel: "Google Picker",
    readinessCheck: "Browser API key + OAuth client ID with restricted referrers and reviewed scopes.",
    surface: "Browser",
  },
  {
    providerKey: "video_frame_extractor",
    platform: "VIDEO_FRAME_EXTRACTOR",
    category: "ARCHIVE_STORAGE",
    section: "ARCHIVE_STORAGE",
    uiLabel: "Video Frame Extractor",
    readinessCheck: "Runtime contract only. No worker or media processing is implemented.",
    surface: "Server",
  },
  {
    providerKey: "storage_provider",
    platform: "STORAGE_PROVIDER",
    category: "ARCHIVE_STORAGE",
    section: "ARCHIVE_STORAGE",
    uiLabel: "Storage Provider",
    readinessCheck: "Storage namespace + server-side write token. Never expose write tokens in frontend.",
    surface: "Server",
  },
  {
    providerKey: "internal_webhooks",
    platform: "INTERNAL_API",
    category: "INTERNAL_API",
    section: "INTERNAL_API",
    uiLabel: "Internal APIs",
    readinessCheck: "Internal contract name + optional shared secret and idempotency notes.",
    surface: "Internal",
  },
  {
    providerKey: "internal_webhooks",
    platform: "CUSTOM",
    category: "CUSTOM",
    section: "INTERNAL_API",
    uiLabel: "Custom Provider",
    readinessCheck: "Use only when the provider is not yet formalized in the catalog.",
    surface: "Internal",
  },
];

export function getConnectionOptionByPlatform(platform: string) {
  return PROVIDER_CONNECTION_MAP.find((option) => option.platform === platform) ?? null;
}

export function getConnectionSectionForPlatform(platform: string) {
  return getConnectionOptionByPlatform(platform)?.section ?? "INTERNAL_API";
}

export function getConnectionOptionsBySection(section: ConnectionSectionKey | "ALL") {
  if (section === "ALL") return PROVIDER_CONNECTION_MAP;
  return PROVIDER_CONNECTION_MAP.filter((option) => option.section === section);
}

export function getProviderForPlatform(platform: string): ProviderCatalogEntry | null {
  const option = getConnectionOptionByPlatform(platform);
  return option ? getProviderByKey(option.providerKey) ?? null : null;
}

export function getProviderHelpDetails(platform: string) {
  const option = getConnectionOptionByPlatform(platform);
  const provider = option ? getProviderByKey(option.providerKey) ?? null : null;

  return {
    option,
    provider,
    title: option?.uiLabel ?? platform,
    purpose: provider?.notes[0] ?? option?.readinessCheck ?? "Provider contract needs documentation.",
    docs: provider?.officialDocs ?? [],
    credentialFields: provider?.credentialFields ?? [],
    capabilities: provider?.capabilities ?? [],
    readinessLayers: provider?.readinessLayers ?? [],
    implementationStatus: provider?.implementationStatus ?? "PLANNED",
    notes: provider?.notes ?? [],
  };
}
