import "server-only";

import { inboxMediaSpec, inboxMediaFilename } from "./inbox-media";
import { prepareVoiceNote } from "./voice-note";
import { uploadMessageMedia, sendMediaMessage } from "./providers/meta-whatsapp/media-messages";
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
      where: { channel: "WHATSAPP", eventType: "inbound_message", recipient: { in: variants }, ...(senderId ? { senderId } : { OR: [{senderId: null}, {senderId: {isSet:false}}] }) },
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
  attachment?: { file: File; voice: boolean },
): Promise<ReplyResult> {
  const text = body.trim();
  if (!text && !attachment) return { ok: false, reason: "EMPTY_BODY" };
  const mediaSpec = attachment ? inboxMediaSpec(attachment.file.type, attachment.file.size, attachment.voice) : null;
  if (attachment && !mediaSpec) return { ok: false, reason: "MEDIA_TYPE_OR_SIZE_INVALID" };
  if (mediaSpec?.kind === "audio" && text) return { ok: false, reason: "AUDIO_CAPTION_UNSUPPORTED" };
  if (attachment && text.length > 1024) return { ok: false, reason: "MEDIA_CAPTION_TOO_LONG" };

  const { senderId, phone } = parseConversationId(conversationId);
  const to = normalizePhoneE164(phone);
  if (!to) return { ok: false, reason: "INVALID_RECIPIENT" };

  // `doNotContact` is an absolute outbound guard. The 24-hour customer-service
  // window permits free-form replies at Meta, but it does not override a donor's
  // explicit platform-level communication block.
  let policyUnavailable = false;
  const blockedProfile = await prisma.donorCommunicationProfile
    .findFirst({
      where: { phone: { in: phoneMatchVariants(to) }, doNotContact: true },
      select: { id: true },
    })
    .catch(() => { policyUnavailable = true; return null; });
  if (policyUnavailable) return { ok: false, reason: "CONTACT_POLICY_UNAVAILABLE" };
  if (blockedProfile) return { ok: false, reason: "DO_NOT_CONTACT" };

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

  if (known && (!known.enabled || known.status !== "ACTIVE" || known.channel !== "WHATSAPP")) return { ok: false, reason: "CONVERSATION_SENDER_UNAVAILABLE" };

  let resolvedSenderId: string | null = known?.id ?? null;
  let phoneNumberId: string | null = known?.phoneNumberId ?? null;

  if (!known) {
    const routed = resolveSenderFromSnapshot(snapshot, { purpose: "UTILITY" });
    if (!routed.ok) return { ok: false, reason: routed.reason };
    resolvedSenderId = routed.sender.id;
    phoneNumberId = routed.sender.phoneNumberId;
  }

  if (!phoneNumberId) return { ok: false, reason: "META_SENDER_MISSING_PHONE_NUMBER_ID" };

  const runtime = await getActiveMetaWhatsappRuntimeConfig();
  if (!runtime.configured) return { ok: false, reason: "META_NOT_CONFIGURED" };
  let mediaBlob: Blob | null = attachment?.file || null;
  if (attachment?.voice) {
    try { mediaBlob = await prepareVoiceNote(attachment.file); }
    catch (error) { return { ok: false, reason: error instanceof Error ? error.message : "VOICE_CONVERSION_FAILED" }; }
  }
  const media = mediaSpec && attachment ? { kind: mediaSpec.kind, mediaId: null as string | null, mimeType: mediaBlob!.type, filename: attachment.voice ? "voice.ogg" : inboxMediaFilename(attachment.file.name), caption: text || null, voice: attachment.voice } : null;

  const created = await createDeliveryRecord({
    channel: "WHATSAPP",
    provider: "META_WHATSAPP",
    origin: "MANUAL",
    purpose: "UTILITY",
    recipientPhone: to,
    renderedBody: text,
    ...(media ? { variables: { media } } : {}),
    senderId: resolvedSenderId,
    createdBy: actor?.actorId ?? null,
    status: "RENDERED",
  });
  if (!created.ok) return { ok: false, reason: "ARCHIVE_FAILED" };

  const { sendTextMessage } = await import("./providers/meta-whatsapp/messages");
  if (media && mediaBlob) {
    const uploaded = await uploadMessageMedia(runtime.values, phoneNumberId, mediaBlob, media.filename);
    if (!uploaded.ok) { await markDeliveryStatus(created.data.id, "FAILED", { errorMessage: uploaded.reason }); return uploaded; }
    media.mediaId = uploaded.id;
    // Persist the media reference before asking Meta to send; the authenticated proxy can replay it.
    try { await prisma.communicationDelivery.update({ where: { id: created.data.id }, data: { variables: { media } } }); }
    catch { await markDeliveryStatus(created.data.id, "FAILED", { errorMessage: "MEDIA_ARCHIVE_FAILED" }); return { ok: false, reason: "MEDIA_ARCHIVE_FAILED" }; }
  }
  const sent = media ? await sendMediaMessage(runtime.values, { phoneNumberId, to, kind: media.kind, id: media.mediaId!, caption: text, filename: media.filename, voice: media.voice, replyToMessageId: window.lastInboundMessageId }) : await sendTextMessage(
    { phoneNumberId, to, body: text, replyToMessageId: window.lastInboundMessageId }, runtime,
  );
  if (!sent.ok) {
    await markDeliveryStatus(created.data.id, sent.reason === "MEDIA_SEND_UNCONFIRMED" ? "RENDERED" : "FAILED", { errorMessage: sent.detail ? `${sent.reason}  ${sent.detail}` : sent.reason });
    return { ok: false, reason: sent.reason, detail: sent.detail ?? null };
  }
  const archived = await markDeliveryStatus(created.data.id, "SENT", { providerMessageId: sent.providerMessageId });
  if (!archived.ok) return { ok: false, reason: "ACCEPTED_UNRECORDED" };
  return { ok: true, deliveryId: created.data.id, providerMessageId: sent.providerMessageId };
}
