/**
 * Allowed values for the Communication Center runtime string fields. These mirror the
 * documented values on the Prisma models (stored as strings, not Prisma enums, so the
 * lifecycle can evolve safely on MongoDB). Import these instead of hardcoding literals.
 */

export const COMMUNICATION_CHANNELS = ["WHATSAPP", "EMAIL", "SMS"] as const;
export type CommunicationChannelId = (typeof COMMUNICATION_CHANNELS)[number];

// Final architecture provider ids (ELASTIC_EMAIL / BREVO_SMS / NETGSM_SMS are the active ones;
// META_WHATSAPP for WhatsApp; BREVO_EMAIL + TWILIO + SENDGRID + legacy NETGSM kept so historical
// delivery rows written before the Elastic Email migration still validate).
export const COMMUNICATION_PROVIDERS = ["META_WHATSAPP", "ELASTIC_EMAIL", "BREVO_EMAIL", "BREVO_SMS", "NETGSM_SMS", "TWILIO", "SENDGRID", "NETGSM", "CUSTOM"] as const;
export type CommunicationProviderId = (typeof COMMUNICATION_PROVIDERS)[number];

export const COMMUNICATION_PURPOSES = ["MARKETING", "UTILITY", "TRANSACTIONAL", "AUTHENTICATION"] as const;
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
  "CANCELLED",
  "FAILED",
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

/**
 * Statuses that assert a real provider accepted/advanced the message. A delivery may
 * only enter one of these when the real provider call succeeded (i.e. a providerMessageId
 * exists or a real provider event was received). Never set these speculatively.
 */
export const PROVIDER_SUCCESS_STATUSES = [
  "SENT_TO_PROVIDER",
  "SENT",
  "DELIVERED",
  "READ",
  "OPENED",
  "CLICKED",
  "REPLIED",
] as const satisfies readonly DeliveryStatusId[];

/**
 * Statuses a delivery may be re-sent from: it was never accepted by a provider, so sending again
 * cannot duplicate anything the recipient already has.
 */
export const RETRYABLE_STATUSES = ["FAILED", "SKIPPED"] as const satisfies readonly DeliveryStatusId[];

/**
 * Terminal failures that must NOT be retried. A bounce is the receiving server stating the address
 * is undeliverable — re-sending does not fix the address, it only accrues bounce rate, which is the
 * fastest way to get a sending domain throttled or blocklisted.
 */
export const NON_RETRYABLE_TERMINAL = ["BOUNCED"] as const satisfies readonly DeliveryStatusId[];

export function isCommunicationChannel(v: unknown): v is CommunicationChannelId {
  return typeof v === "string" && (COMMUNICATION_CHANNELS as readonly string[]).includes(v);
}
export function isCommunicationProvider(v: unknown): v is CommunicationProviderId {
  return typeof v === "string" && (COMMUNICATION_PROVIDERS as readonly string[]).includes(v);
}
export function isDeliveryStatus(v: unknown): v is DeliveryStatusId {
  return typeof v === "string" && (DELIVERY_STATUSES as readonly string[]).includes(v);
}
export function isCampaignStatus(v: unknown): v is CampaignStatusId {
  return typeof v === "string" && (CAMPAIGN_STATUSES as readonly string[]).includes(v);
}
export function isProviderSuccessStatus(v: string): boolean {
  return (PROVIDER_SUCCESS_STATUSES as readonly string[]).includes(v);
}
