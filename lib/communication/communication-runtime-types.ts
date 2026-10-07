/**
 * Canonical Communication Center domain identifiers.
 *
 * Keep active runtime values separate from historical provider ids. Product code, routing,
 * sender management, and new delivery records must use ACTIVE_COMMUNICATION_PROVIDERS only.
 * Historical ids remain accepted only so old delivery rows can still be read safely.
 */

export const COMMUNICATION_CHANNELS = ["WHATSAPP", "EMAIL", "SMS"] as const;
export type CommunicationChannelId = (typeof COMMUNICATION_CHANNELS)[number];

export const ACTIVE_COMMUNICATION_PROVIDERS = [
  "META_WHATSAPP",
  "ELASTIC_EMAIL",
  "BREVO_SMS",
  "NETGSM_SMS",
] as const;
export type ActiveCommunicationProviderId = (typeof ACTIVE_COMMUNICATION_PROVIDERS)[number];

export const HISTORICAL_COMMUNICATION_PROVIDERS = [
  "BREVO_EMAIL",
  "TWILIO",
  "SENDGRID",
  "NETGSM",
  "CUSTOM",
] as const;
export type HistoricalCommunicationProviderId = (typeof HISTORICAL_COMMUNICATION_PROVIDERS)[number];

export const COMMUNICATION_PROVIDERS = [
  ...ACTIVE_COMMUNICATION_PROVIDERS,
  ...HISTORICAL_COMMUNICATION_PROVIDERS,
] as const;
export type CommunicationProviderId = (typeof COMMUNICATION_PROVIDERS)[number];

export const COMMUNICATION_PURPOSES = [
  "MARKETING",
  "UTILITY",
  "TRANSACTIONAL",
  "AUTHENTICATION",
] as const;
export type CommunicationPurposeId = (typeof COMMUNICATION_PURPOSES)[number];

export const SENDER_STATUSES = ["ACTIVE", "DISABLED", "NEEDS_ATTENTION", "NOT_CONFIGURED"] as const;
export type SenderStatusId = (typeof SENDER_STATUSES)[number];

export const SENDER_ROUTING_MODES = ["AUTO", "FIXED"] as const;
export type SenderRoutingMode = (typeof SENDER_ROUTING_MODES)[number];

export const CAMPAIGN_STATUSES = [
  "DRAFT",
  "REVIEW",
  "APPROVED",
  "SCHEDULED",
  "SENDING",
  "SENT",
  "SENT_WITH_ISSUES",
  "BLOCKED",
  "CANCELLED",
  "FAILED",
  "ARCHIVED",
] as const;
export type CampaignStatusId = (typeof CAMPAIGN_STATUSES)[number];

export const DELIVERY_ORIGINS = ["MANUAL", "CAMPAIGN", "TRIGGER", "TEST", "REACTIVATION", "SYSTEM"] as const;
export type DeliveryOriginId = (typeof DELIVERY_ORIGINS)[number];

export const DELIVERY_STATUSES = [
  "DRAFT",
  "QUEUED",
  "RENDERED",
  "SKIPPED",
  "SENT_TO_PROVIDER",
  "SENT",
  "DELIVERED",
  "READ",
  "OPENED",
  "CLICKED",
  "REPLIED",
  "FAILED",
  "BOUNCED",
  "UNSUBSCRIBED",
  "CANCELLED",
] as const;
export type DeliveryStatusId = (typeof DELIVERY_STATUSES)[number];

export const PROVIDER_SUCCESS_STATUSES = [
  "SENT_TO_PROVIDER",
  "SENT",
  "DELIVERED",
  "READ",
  "OPENED",
  "CLICKED",
  "REPLIED",
] as const satisfies readonly DeliveryStatusId[];

export const RETRYABLE_STATUSES = ["FAILED", "SKIPPED"] as const satisfies readonly DeliveryStatusId[];
export const NON_RETRYABLE_TERMINAL = ["BOUNCED"] as const satisfies readonly DeliveryStatusId[];

export function isCommunicationChannel(value: unknown): value is CommunicationChannelId {
  return typeof value === "string" && (COMMUNICATION_CHANNELS as readonly string[]).includes(value);
}

export function isActiveCommunicationProvider(value: unknown): value is ActiveCommunicationProviderId {
  return typeof value === "string" && (ACTIVE_COMMUNICATION_PROVIDERS as readonly string[]).includes(value);
}

export function isCommunicationProvider(value: unknown): value is CommunicationProviderId {
  return typeof value === "string" && (COMMUNICATION_PROVIDERS as readonly string[]).includes(value);
}

export function isDeliveryStatus(value: unknown): value is DeliveryStatusId {
  return typeof value === "string" && (DELIVERY_STATUSES as readonly string[]).includes(value);
}

export function isCampaignStatus(value: unknown): value is CampaignStatusId {
  return typeof value === "string" && (CAMPAIGN_STATUSES as readonly string[]).includes(value);
}

export function isProviderSuccessStatus(value: string): boolean {
  return (PROVIDER_SUCCESS_STATUSES as readonly string[]).includes(value);
}
