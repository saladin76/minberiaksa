import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { markDeliveryStatus } from "./delivery-log-service";
import { shouldApplyDeliveryStatus } from "./delivery-status-progress";
import { normalizePhoneE164, phoneMatchVariants } from "./phone";
import type { NormalizedWebhookEvent } from "./providers/meta-whatsapp/types";
import type { DeliveryStatusId } from "./communication-runtime-types";

/**
 * Normalized WhatsApp webhook events → the archive.
 *
 * Three contracts are kept here, each of which was previously broken in a way that lost information
 * silently rather than failing loudly.
 *
 * **A write that failed is not a write that was already done.** `recordEvent` returned `false` both
 * for a duplicate `idempotencyKey` and for any other database error, and the caller counted both as
 * "duplicate" and moved on. A Mongo blip therefore dropped a real delivery receipt for good: the
 * route answered 200, so Meta  which retries for up to 24 hours  never sent it again. The result
 * is now tri-state, and a persistence failure is reported so the route can return non-2xx and let
 * Meta redeliver.
 *
 * **Status only moves forward.** Meta does not guarantee ordering, so a `sent` callback can arrive
 * after `read`. Nothing checked, so a delivery that had reached READ was written back to SENT and the
 * dashboard showed a message going backwards. The shared progression guard now gates it, as it
 * already did for email and SMS.
 *
 * **A reply belongs to the thread it was sent in.** The REPLIED marking matched on
 * `recipientPhone: event.from` alone  a raw string comparison against a raw Meta wa_id, which misses
 * `+90…` versus `90…`, and which ignored the business number entirely. With two senders configured,
 * a donor's reply on one number marked the newest outbound on the OTHER number as replied. Matching
 * is now on the business sender plus every plausible spelling of the contact's number.
 */

export type WebhookProcessSummary = {
  received: number;
  processed: number;
  duplicates: number;
  deliveryUpdates: number;
  inbound: number;
  /** Events that could not be persisted. Non-zero means Meta should redeliver. */
  persistenceErrors: number;
  /** Status callbacks refused because the delivery had already progressed further. */
  staleStatuses: number;
};

type RecordOutcome = "INSERTED" | "DUPLICATE" | "ERROR";

const WHATSAPP_OPTOUT_TERMS = new Set([
  "stop", "unsubscribe", "cancel", "end", "quit", "opt out", "optout",
  "dur", "iptal", "ايقاف", "وقف", "توقف", "الغاء", "انهاء",
  "لا ترسل", "لا ترسلوا", "لا تراسلني", "لا تتواصل معي",
]);

function normalizeOptOutText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .normalize("NFKC")
    .replace(/[إأآٱ]/g, "ا")
    .toLowerCase()
    .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, "")
    .replace(/\s+/g, " ");
}

function isWhatsappOptOut(event: NormalizedWebhookEvent): event is Extract<NormalizedWebhookEvent, { kind: "inbound" }> {
  if (event.kind !== "inbound") return false;
  return [event.text, event.buttonReply?.title, event.buttonReply?.id]
    .filter((value): value is string => Boolean(value))
    .some((value) => WHATSAPP_OPTOUT_TERMS.has(normalizeOptOutText(value)));
}

/** Apply a donor's clear STOP request before acknowledging the inbound webhook event. */
async function applyWhatsappOptOut(from: string | null): Promise<boolean> {
  if (!from) return true;
  const variants = phoneMatchVariants(from);
  if (!variants.length) return true;
  try {
    const profiles = await prisma.donorCommunicationProfile.findMany({
      where: { phone: { in: variants } },
      select: { userId: true },
    });
    const userIds = [...new Set(profiles.map((profile) => profile.userId).filter(Boolean))];
    if (!userIds.length) return true;
    await prisma.donorCommunicationProfile.updateMany({
      where: { userId: { in: userIds } },
      data: {
        whatsappOptIn: false,
        consentSource: "meta-whatsapp-inbound-opt-out",
        lastConsentAt: new Date(),
      },
    });
    return true;
  } catch (error) {
    console.error("WhatsApp inbound opt-out update failed", {
      errorName: error instanceof Error ? error.name : "UNKNOWN",
    });
    return false;
  }
}

async function senderIdForPhoneNumber(
  phoneNumberId: string | null,
): Promise<{ ok: true; senderId: string | null } | { ok: false }> {
  if (!phoneNumberId) return { ok: true, senderId: null };
  try {
    const s = await prisma.communicationSender.findFirst({ where: { phoneNumberId }, select: { id: true } });
    return { ok: true, senderId: s?.id ?? null };
  } catch (error) {
    console.error("sender lookup failed for WhatsApp webhook", { phoneNumberId, error });
    return { ok: false };
  }
}

/**
 * Insert one provider event.
 *
 * The three outcomes are genuinely different and the caller must treat them differently: INSERTED is
 * new work, DUPLICATE is work already done (safe to skip  the unique `idempotencyKey` is what makes
 * Meta's retries harmless), and ERROR is work NOT done, which must not be acknowledged.
 */
async function recordEvent(data: {
  deliveryId: string | null;
  eventType: string;
  providerMessageId: string;
  senderId: string | null;
  recipient: string | null;
  status: string | null;
  errorMessage: string | null;
  idempotencyKey: string;
  payloadSanitized: Prisma.InputJsonValue;
  receivedAt?: Date;
}): Promise<RecordOutcome> {
  try {
    await prisma.communicationProviderEvent.create({
      data: {
        deliveryId: data.deliveryId,
        channel: "WHATSAPP",
        provider: "META_WHATSAPP",
        eventType: data.eventType,
        providerMessageId: data.providerMessageId,
        senderId: data.senderId,
        recipient: data.recipient,
        payloadSanitized: data.payloadSanitized,
        processedAt: new Date(),
        ...(data.receivedAt ? { receivedAt: data.receivedAt } : {}),
        status: data.status,
        errorMessage: data.errorMessage,
        idempotencyKey: data.idempotencyKey,
      },
    });
    return "INSERTED";
  } catch (error) {
    const code = typeof error === "object" && error ? (error as { code?: string }).code : undefined;
    /* P2002 is the unique idempotencyKey: this exact event was already stored. */
    if (code === "P2002") return "DUPLICATE";
    console.error("recordEvent failed", { eventType: data.eventType, idempotencyKey: data.idempotencyKey, error });
    return "ERROR";
  }
}

function messageEventTime(timestamp: number | null): Date {
  const now = Date.now();
  const milliseconds = timestamp === null ? NaN : timestamp * 1000;
  return new Date(Number.isFinite(milliseconds) && milliseconds > 0 && milliseconds <= now + 300_000 ? milliseconds : now);
}

export async function processWhatsappEvents(events: NormalizedWebhookEvent[]): Promise<WebhookProcessSummary> {
  const summary: WebhookProcessSummary = {
    received: events.length, processed: 0, duplicates: 0, deliveryUpdates: 0, inbound: 0,
    persistenceErrors: 0, staleStatuses: 0,
  };
  if (!process.env.DATABASE_URL) {
    /* No archive to write to. The events are real, so this is a failure, not a no-op. */
    summary.persistenceErrors = events.length;
    return summary;
  }

  for (const event of events) {
    const senderLookup = await senderIdForPhoneNumber(event.phoneNumberId);
    if (!senderLookup.ok) {
      summary.persistenceErrors += 1;
      continue;
    }
    const senderId = senderLookup.senderId;

    // Run before event idempotency recording so a retry can complete the opt-out if the profile write failed.
    if (isWhatsappOptOut(event) && !(await applyWhatsappOptOut(event.from))) {
      summary.persistenceErrors += 1;
      continue;
    }

    if (event.kind === "status") {
      let delivery: { id: string; status: string } | null = null;
      try {
        delivery = await prisma.communicationDelivery.findFirst({
          where: { providerMessageId: event.providerMessageId },
          select: { id: true, status: true },
        });
      } catch (error) {
        console.error("delivery lookup failed for WhatsApp status webhook", {
          providerMessageId: event.providerMessageId,
          error,
        });
        summary.persistenceErrors += 1;
        continue;
      }

      const outcome = await recordEvent({
        deliveryId: delivery?.id ?? null,
        eventType: `status_${event.status.toLowerCase()}`,
        providerMessageId: event.providerMessageId,
        senderId,
        recipient: event.recipient,
        status: event.status,
        errorMessage: event.errorMessage,
        idempotencyKey: event.idempotencyKey,
        payloadSanitized: {
          kind: "status",
          status: event.status,
          recipient: event.recipient,
          timestamp: event.timestamp,
          error: event.errorMessage,
        },
      });
      if (outcome === "DUPLICATE") {
        summary.duplicates += 1;
      } else if (outcome === "ERROR") {
        summary.persistenceErrors += 1;
        continue;
      } else {
        summary.processed += 1;
      }

      if (!delivery) {
        // App-originated messages live in the event archive. Persist their latest provider state
        // too, so loading an older history page does not lose a newer delivery/read receipt.
        const previous = ["SENT", "DELIVERED", "READ"].filter(status => shouldApplyDeliveryStatus(status, event.status));
        try {
          await prisma.communicationProviderEvent.updateMany({
            where: { channel: "WHATSAPP", eventType: "outbound_echo", providerMessageId: event.providerMessageId, senderId, status: { in: previous } },
            data: { status: event.status },
          });
        } catch { summary.persistenceErrors += 1; }
      }
      if (delivery) {
        /* Out-of-order callbacks are normal; a late `sent` must not undo a `read`. The event itself
           is kept either way  it is evidence  but the delivery's status does not move backwards. */
        if (!shouldApplyDeliveryStatus(delivery.status, event.status as DeliveryStatusId)) {
          summary.staleStatuses += 1;
          continue;
        }
        const patch = event.status === "FAILED"
          ? { providerMessageId: event.providerMessageId, errorMessage: event.errorMessage }
          : { providerMessageId: event.providerMessageId };
        const res = await markDeliveryStatus(delivery.id, event.status, patch);
        if (res.ok) summary.deliveryUpdates += 1;
        else summary.persistenceErrors += 1;
      }
      continue;
    }

    if (event.kind === "echo") {
      // One unique provider-event write makes webhook redelivery safe even after a process crash.
      // An app echo is evidence of sending, but never evidence of delivery/read or a donor reply.
      let delivery: { id: string } | null;
      try {
        delivery = await prisma.communicationDelivery.findFirst({
          where: { channel: "WHATSAPP", providerMessageId: event.providerMessageId, senderId }, select: { id: true },
        });
      } catch { summary.persistenceErrors += 1; continue; }
      const outcome = await recordEvent({
        deliveryId: delivery?.id ?? null, eventType: "outbound_echo", providerMessageId: event.providerMessageId,
        senderId, recipient: normalizePhoneE164(event.recipient) ?? event.recipient,
        status: "SENT", errorMessage: null, idempotencyKey: event.idempotencyKey,
        receivedAt: messageEventTime(event.timestamp),
        payloadSanitized: { kind: "echo", text: event.text, messageType: event.messageType,
          timestamp: event.timestamp, media: event.media ?? null, replyToMessageId: event.replyToMessageId ?? null,
          source: "WHATSAPP_BUSINESS_APP" },
      });
      if (outcome === "ERROR") summary.persistenceErrors += 1;
      else if (outcome === "DUPLICATE") summary.duplicates += 1;
      else summary.processed += 1;
      if (outcome !== "ERROR") {
        try {
          // Read receipts AFTER insertion: a receipt arriving concurrently before the echo was
          // archived must still be applied. A receipt arriving afterward can update it directly.
          const receipts = await prisma.communicationProviderEvent.findMany({
            where: { channel: "WHATSAPP", providerMessageId: event.providerMessageId, senderId, eventType: { in: ["status_read", "status_delivered", "status_failed"] } },
            select: { status: true }, take: 10,
          });
          const status = receipts.some(row => row.status === "FAILED") ? "FAILED" : receipts.some(row => row.status === "READ") ? "READ"
            : receipts.some(row => row.status === "DELIVERED") ? "DELIVERED" : null;
          if (status) await prisma.communicationProviderEvent.updateMany({
            where: { channel: "WHATSAPP", eventType: "outbound_echo", providerMessageId: event.providerMessageId, senderId,
              status: { in: ["SENT", "DELIVERED", "READ"].filter(previous => shouldApplyDeliveryStatus(previous, status)) } },
            data: { status },
          });
        } catch { summary.persistenceErrors += 1; }
      }
      continue;
    }

    // Inbound user message
    const outcome = await recordEvent({
      deliveryId: null,
      eventType: "inbound_message",
      receivedAt: messageEventTime(event.timestamp),
      providerMessageId: event.providerMessageId,
      senderId,
      /* Stored in E.164 so the inbox groups a contact under one identity regardless of whether the
         number arrived from Meta as `905…`, `+905…` or with punctuation. */
      recipient: normalizePhoneE164(event.from) ?? event.from,
      status: "RECEIVED",
      errorMessage: null,
      idempotencyKey: event.idempotencyKey,
      payloadSanitized: {
        kind: "inbound",
        from: event.from,
        contactE164: normalizePhoneE164(event.from),
        profileName: event.profileName,
        text: event.text,
        messageType: event.messageType,
        timestamp: event.timestamp,
        media: event.media ?? null,
        replyToMessageId: event.replyToMessageId ?? null,
        buttonReply: event.buttonReply ?? null,
      },
    });
    if (outcome === "DUPLICATE") {
      summary.duplicates += 1;
    } else if (outcome === "ERROR") {
      summary.persistenceErrors += 1;
      continue;
    } else {
      summary.processed += 1;
      summary.inbound += 1;
    }

    /*
     * If Meta identifies a concrete business phone but we do not have a matching sender row, do not
     * fall back to a cross-sender reply lookup. Archiving the inbound event is still useful, while
     * attribution waits until the sender configuration is corrected.
     */
    if (event.phoneNumberId && !senderId) continue;
    const attributed = await attributeReply(event.from, senderId, summary);
    if (!attributed) summary.persistenceErrors += 1;
  }

  return summary;
}

/**
 * Mark the outbound message this reply answers.
 *
 * Scoped to the business number the reply arrived on, because a WhatsApp thread IS a pair of
 * numbers: with two senders configured, the newest outbound overall is often on the other thread
 * entirely. When the reply arrives on a number no `CommunicationSender` row claims, the scope is
 * dropped rather than the attribution  a single-sender deployment that predates sender rows still
 * gets its replies matched.
 */
async function attributeReply(from: string | null, senderId: string | null, summary: WebhookProcessSummary): Promise<boolean> {
  if (!from) return true;
  const variants = phoneMatchVariants(from);
  if (!variants.length) return true;

  let lastOutbound: { id: string; status: string; providerMessageId: string | null } | null = null;
  try {
    lastOutbound = await prisma.communicationDelivery.findFirst({
      where: {
        channel: "WHATSAPP",
        recipientPhone: { in: variants },
        providerMessageId: { not: null },
        status: { in: ["SENT", "DELIVERED", "READ", "OPENED", "CLICKED"] },
        ...(senderId ? { senderId } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, providerMessageId: true },
    });
  } catch (error) {
    console.error("WhatsApp reply attribution lookup failed", { from, senderId, error });
    return false;
  }

  if (!lastOutbound?.providerMessageId) return true;
  if (!shouldApplyDeliveryStatus(lastOutbound.status, "REPLIED")) return true;
  const res = await markDeliveryStatus(lastOutbound.id, "REPLIED", { providerMessageId: lastOutbound.providerMessageId });
  if (res.ok) {
    summary.deliveryUpdates += 1;
    return true;
  }
  return false;
}
