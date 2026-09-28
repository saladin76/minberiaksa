import { getActiveMetaWhatsappRuntimeConfig } from "../../runtime-config";
import { graphFetch, metaRuntimeFailure, type MetaRuntimeConfig } from "./client";
import { META_REASONS } from "./errors";
import type { SendTemplateInput, SendTextInput, SendResult } from "./types";

/**
 * Free-form text, for answering a donor inside WhatsApp's customer-service window.
 *
 * Meta allows a business to send free text only within 24 hours of the contact's last message; a
 * business-initiated message must be an approved template. So this is the inbox reply path and nothing
 * else — outside the window Meta rejects it with `#131047`, which is the correct outcome rather than
 * something to work around. The caller checks the window first so the operator is told before typing,
 * not after sending.
 */
export async function sendTextMessage(input: SendTextInput, runtime?: MetaRuntimeConfig): Promise<SendResult> {
  const resolved = runtime ?? await getActiveMetaWhatsappRuntimeConfig();
  if (!resolved.configured) return { ok: false, reason: metaRuntimeFailure(resolved) };
  const phoneNumberId = input.phoneNumberId || resolved.values.defaultPhoneNumberId;
  if (!phoneNumberId) return { ok: false, reason: META_REASONS.SENDER_MISSING_PHONE_NUMBER_ID };
  const text = input.body.trim();
  if (!text) return { ok: false, reason: "EMPTY_BODY" };

  const body = {
    messaging_product: "whatsapp",
    to: input.to,
    type: "text",
    /* Links are left unpreviewed: a preview card is generated from whatever the URL resolves to,
       which is not something an operator should publish to a donor without seeing it. */
    text: { preview_url: false, body: text.slice(0, 4096) },
    ...(input.replyToMessageId ? { context: { message_id: input.replyToMessageId } } : {}),
  };
  const result = await graphFetch(resolved.values, `${phoneNumberId}/messages`, { method: "POST", body: JSON.stringify(body) });
  if (!result.ok) return { ok: false, reason: result.reason, detail: result.detail };
  const data = (result.data ?? {}) as { messages?: { id?: unknown }[] };
  const id = data.messages?.[0]?.id;
  if (typeof id !== "string" || !id) return { ok: false, reason: META_REASONS.INVALID_RESPONSE };
  return { ok: true, providerMessageId: id };
}

export async function sendTemplateMessage(input: SendTemplateInput, runtime?: MetaRuntimeConfig): Promise<SendResult> {
  const resolved = runtime ?? await getActiveMetaWhatsappRuntimeConfig();
  if (!resolved.configured) return { ok: false, reason: metaRuntimeFailure(resolved) };
  const phoneNumberId = input.phoneNumberId || resolved.values.defaultPhoneNumberId;
  if (!phoneNumberId) return { ok: false, reason: META_REASONS.SENDER_MISSING_PHONE_NUMBER_ID };

  const body = {
    messaging_product: "whatsapp",
    to: input.to,
    type: "template",
    template: {
      name: input.templateName,
      language: { code: input.languageCode },
      ...(input.components && input.components.length ? { components: input.components } : {}),
    },
  };
  const result = await graphFetch(resolved.values, `${phoneNumberId}/messages`, { method: "POST", body: JSON.stringify(body) });
  if (!result.ok) return { ok: false, reason: result.reason, detail: result.detail };
  const data = (result.data ?? {}) as { messages?: { id?: unknown }[] };
  const id = data.messages?.[0]?.id;
  if (typeof id !== "string" || !id) return { ok: false, reason: META_REASONS.INVALID_RESPONSE };
  return { ok: true, providerMessageId: id };
}
