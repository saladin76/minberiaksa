/** Types for the Meta WhatsApp Cloud API adapter. Server-only. */

export type MetaGraphConfig = {
  accessToken: string;
  graphVersion: string;
  appSecret: string | null;
  verifyToken: string | null;
  /** Legacy fallback only; normal sends use a CommunicationSender phoneNumberId. */
  defaultPhoneNumberId: string | null;
  /** Legacy fallback only; WABA identity is stored per CommunicationSender. */
  businessAccountId: string | null;
};

export type SendTemplateInput = {
  phoneNumberId: string;
  to: string;
  templateName: string;
  languageCode: string;
  components?: unknown[];
};

export type SendTextInput = {
  phoneNumberId: string;
  to: string;
  body: string;
  /** The inbound wamid this answers, so WhatsApp threads it as a reply. */
  replyToMessageId?: string | null;
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

/**
 * A non-text inbound message, described rather than dropped.
 *
 * The parser used to read `text.body` and nothing else, so a donor who replied with a voice note,
 * a photo of a receipt or a document arrived as `text: null, messageType: "audio"`  the message
 * existed in the log with no indication that anything had been said. The id is kept because it is
 * what the Media endpoint needs to fetch the asset later; the asset itself is not downloaded here,
 * since a webhook must answer in milliseconds. No URL is stored: Meta's media URLs expire, so a
 * stored one is a broken link with a misleading air of permanence.
 */
export type InboundMediaDescriptor = {
  /** image | video | audio | document | sticker */
  kind: string;
  mediaId: string | null;
  mimeType: string | null;
  filename: string | null;
  caption: string | null;
  /** Voice notes: Meta flags these separately from an attached audio file. */
  voice?: boolean;
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
  /** Set for image/video/audio/document/sticker messages. */
  media?: InboundMediaDescriptor | null;
  /** The wamid this message replies to, when the donor used WhatsApp's reply affordance. */
  replyToMessageId?: string | null;
  /** Set when the donor tapped a template button or an interactive list/button reply. */
  buttonReply?: { id: string | null; title: string | null } | null;
};

export type NormalizedWebhookEvent = NormalizedStatusEvent | NormalizedInboundEvent;
