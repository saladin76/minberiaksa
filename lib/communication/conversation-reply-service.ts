import "server-only";

import { prisma } from "@/lib/prisma";
import { createDeliveryRecord, markDeliveryStatus } from "./delivery-log-service";
import { parseConversationId } from "./conversation-service";
import { phoneMatchVariants, normalizePhoneE164 } from "./phone";
import { loadSenderRoutingSnapshot, resolveSenderFromSnapshot } from "./sender-resolution";
import { getActiveMetaWhatsappRuntimeConfig } from "./runtime-config";

/**
 * Replying to a donor from the inbox.
 *
 * WhatsApp allows a business free-form text only inside the 24 hours following the contact's last
 * message. Outside it, only an approved template may be sent. That is not a limitation to route
 * around: a business-initiated free-text message is rejected by Meta, and an inbox that lets an
 * operator type one anyway would show a sent message the donor never received. So the window is
 * checked from the archive before anything is sent, and the answer is reported plainly.
 *
 * The reply is archived as a `CommunicationDelivery` like every other outbound message, with
 * `origin: "MANUAL"`  so it appears in the timeline, counts towards the conversation, and moves
 * "needs reply" off the queue by the same rule everything else uses.
 */

/** Meta's customer-service window. */
const WINDOW_MS = 24 * 60 * 60 * 1000;

export type ReplyWindow = {
  open: boolean;
  lastInboundAt: string | null;
  /** Milliseconds left in the window; 0 when closed. */
  remainingMs: number;
  /** The wamid of the donor's last message, so the reply threads under it. */
  lastInboundMessageId: string | null;
};

export async function replyWindowFor(conversationId: string): Promise<ReplyWindow> {
  const closed: ReplyWindow = { open: false, lastInboundAt: null, remainingMs: 0, lastInboundMessageId: null };
  if (!process.env.DATABASE_URL) return closed;
  const { senderId, phone } = parseConversationId(conversationId);
  const variants = phoneMatchVariants(phone);
  if (!variants.length) return closed;

  const last = await prisma.communicationProviderEvent
    .findFirst({
      where: { channel: "WHATSAPP", eventType: "inbound_message", recipient: { in: variants }, ...(senderId ? { senderId } : {}) },
      orderBy: { receivedAt: "desc" },
      select: { receivedAt: true, providerMessageId: true },
    })
    .catch(() => null);
  if (!last?.receivedAt) return closed;

  const elapsed = Date.now() - last.receivedAt.getTime();
  const remaining = Math.max(WINDOW_MS - elapsed, 0);
  return {
    open: remaining > 0,
    lastInboundAt: last.receivedAt.toISOString(),
    remainingMs: remaining,
    lastInboundMessageId: last.providerMessageId ?? null,
  };
}

export type ReplyResult =
  | { ok: true; deliveryId: string; providerMessageId: string | null }
  | { ok: false; reason: string; detail?: string | null };

export async function sendConversationReply(
  conversationId: string,
  body: string,
  actor?: { actorId?: string | null } | null,
): Promise<ReplyResult> {
  const text = body.trim();
  if (!text) return { ok: false, reason: "EMPTY_BODY" };

  const { senderId, phone } = parseConversationId(conversationId);
  const to = normalizePhoneE164(phone);
  if (!to) return { ok: false, reason: "INVALID_RECIPIENT" };

  const window = await replyWindowFor(conversationId);
  if (!window.open) {
    /* Told before the send, not after: outside the window Meta refuses free text, and the operator
       needs to reach for an approved template instead. */
    return { ok: false, reason: "REPLY_WINDOW_CLOSED", detail: window.lastInboundAt };
  }

  /* The reply must leave from the number the donor is talking to. The conversation carries that
     sender; where it does not (a thread that predates sender rows), routing decides as it would for
     any other message to this contact. */
  const snapshot = await loadSenderRoutingSnapshot("WHATSAPP");
  const known = senderId ? snapshot.raw.get(senderId) : null;

  /* A conversation that names a sender must reply from that exact sender. Falling back to another
     number would split the donor's thread across business identities and can attribute a reply to
     the wrong WABA. Only legacy conversations with no sender id at all may use normal routing. */
  if (senderId && !known) {
    return { ok: false, reason: "CONVERSATION_SENDER_NOT_FOUND" };
  }

  let resolvedSenderId: string | null = known?.id ?? null;
  let phoneNumberId: string | null = known?.phoneNumberId ?? null;

  if (!known) {
    const routed = resolveSenderFromSnapshot(snapshot, { purpose: "UTILITY" });
    if (!routed.ok) return { ok: false, reason: routed.reason };
    resolvedSenderId = routed.sender.id;
    phoneNumberId = routed.sender.phoneNumberId;
  }

  if (!phoneNumberId) return { ok: false, reason: "META_SENDER_MISSING_PHONE_NUMBER_ID" };

  const created = await createDeliveryRecord({
    channel: "WHATSAPP",
    provider: "META_WHATSAPP",
    origin: "MANUAL",
    purpose: "UTILITY",
    recipientPhone: to,
    renderedBody: text,
    senderId: resolvedSenderId,
    createdBy: actor?.actorId ?? null,
    status: "RENDERED",
  });
  if (!created.ok) return { ok: false, reason: "ARCHIVE_FAILED" };

  const runtime = await getActiveMetaWhatsappRuntimeConfig();
  const { sendTextMessage } = await import("./providers/meta-whatsapp/messages");
  const sent = await sendTextMessage(
    { phoneNumberId, to, body: text, replyToMessageId: window.lastInboundMessageId },
    runtime,
  );
  if (!sent.ok) {
    await markDeliveryStatus(created.data.id, "FAILED", { errorMessage: sent.detail ? `${sent.reason}  ${sent.detail}` : sent.reason });
    return { ok: false, reason: sent.reason, detail: sent.detail ?? null };
  }
  await markDeliveryStatus(created.data.id, "SENT", { providerMessageId: sent.providerMessageId });
  return { ok: true, deliveryId: created.data.id, providerMessageId: sent.providerMessageId };
}
