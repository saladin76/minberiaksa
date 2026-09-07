import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { markDeliveryStatus } from "./delivery-log-service";
import type { NormalizedWebhookEvent } from "./providers/meta-whatsapp/types";

/**
 * Processes normalized WhatsApp webhook events: stores each as an idempotent
 * CommunicationProviderEvent, updates the matching CommunicationDelivery status, and records
 * inbound messages. Never throws (webhooks must always 200). Duplicate events are ignored via the
 * unique idempotencyKey.
 */

export type WebhookProcessSummary = { received: number; processed: number; duplicates: number; deliveryUpdates: number; inbound: number };

async function senderIdForPhoneNumber(phoneNumberId: string | null): Promise<string | null> {
  if (!phoneNumberId) return null;
  try {
    const s = await prisma.communicationSender.findFirst({ where: { phoneNumberId }, select: { id: true } });
    return s?.id ?? null;
  } catch {
    return null;
  }
}

/** Insert a provider event; returns false when the idempotencyKey already exists (duplicate). */
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
}): Promise<boolean> {
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
        status: data.status,
        errorMessage: data.errorMessage,
        idempotencyKey: data.idempotencyKey,
      },
    });
    return true;
  } catch (error) {
    // Unique idempotencyKey violation → already processed. Any other error → swallow (never throw).
    if (typeof error === "object" && error && (error as { code?: string }).code === "P2002") return false;
    console.error("recordEvent failed", error);
    return false;
  }
}

export async function processWhatsappEvents(events: NormalizedWebhookEvent[]): Promise<WebhookProcessSummary> {
  const summary: WebhookProcessSummary = { received: events.length, processed: 0, duplicates: 0, deliveryUpdates: 0, inbound: 0 };
  if (!process.env.DATABASE_URL) return summary;

  for (const event of events) {
    const senderId = await senderIdForPhoneNumber(event.phoneNumberId);

    if (event.kind === "status") {
      const delivery = await prisma.communicationDelivery
        .findFirst({ where: { providerMessageId: event.providerMessageId }, select: { id: true } })
        .catch(() => null);

      const inserted = await recordEvent({
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
      if (!inserted) {
        summary.duplicates += 1;
        continue;
      }
      summary.processed += 1;

      if (delivery) {
        const patch = event.status === "FAILED" ? { providerMessageId: event.providerMessageId, errorMessage: event.errorMessage } : { providerMessageId: event.providerMessageId };
        const res = await markDeliveryStatus(delivery.id, event.status, patch);
        if (res.ok) summary.deliveryUpdates += 1;
      }
      continue;
    }

    // Inbound user message
    const inserted = await recordEvent({
      deliveryId: null,
      eventType: "inbound_message",
      providerMessageId: event.providerMessageId,
      senderId,
      recipient: event.from,
      status: "RECEIVED",
      errorMessage: null,
      idempotencyKey: event.idempotencyKey,
      payloadSanitized: {
        kind: "inbound",
        from: event.from,
        profileName: event.profileName,
        text: event.text,
        messageType: event.messageType,
        timestamp: event.timestamp,
      },
    });
    if (!inserted) {
      summary.duplicates += 1;
      continue;
    }
    summary.processed += 1;
    summary.inbound += 1;

    // Mark the most recent outbound delivery to this contact as REPLIED (best-effort).
    if (event.from) {
      const lastOutbound = await prisma.communicationDelivery
        .findFirst({
          where: { channel: "WHATSAPP", recipientPhone: event.from, providerMessageId: { not: null }, status: { in: ["SENT", "DELIVERED", "READ"] } },
          orderBy: { createdAt: "desc" },
          select: { id: true, providerMessageId: true },
        })
        .catch(() => null);
      if (lastOutbound?.providerMessageId) {
        await markDeliveryStatus(lastOutbound.id, "REPLIED", { providerMessageId: lastOutbound.providerMessageId });
      }
    }
  }

  return summary;
}
