/** Types for the Meta WhatsApp Cloud API adapter. Server-only. */

export type MetaGraphConfig = {
  accessToken: string;
  graphVersion: string;
  appSecret: string | null;
  verifyToken: string | null;
  defaultPhoneNumberId: string | null;
  businessAccountId: string | null;
};

export type SendTemplateInput = {
  phoneNumberId: string;
  to: string;
  templateName: string;
  languageCode: string;
  components?: unknown[];
};

export type SendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; reason: string; detail?: string };

export type HealthResult =
  | { ok: true; displayPhoneNumber?: string | null; qualityRating?: string | null; verifiedName?: string | null }
  | { ok: false; reason: string; detail?: string };

/** Normalized webhook events after parsing + sanitization (no raw payload, no secrets). */
export type NormalizedStatusEvent = {
  kind: "status";
  providerMessageId: string;
  status: "SENT" | "DELIVERED" | "READ" | "FAILED";
  recipient: string | null;
  phoneNumberId: string | null;
  timestamp: number | null;
  errorMessage: string | null;
  idempotencyKey: string;
};

export type NormalizedInboundEvent = {
  kind: "inbound";
  providerMessageId: string;
  from: string | null;
  profileName: string | null;
  phoneNumberId: string | null;
  text: string | null;
  messageType: string | null;
  timestamp: number | null;
  idempotencyKey: string;
};

export type NormalizedWebhookEvent = NormalizedStatusEvent | NormalizedInboundEvent;
