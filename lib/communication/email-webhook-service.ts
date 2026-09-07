import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { markDeliveryStatus } from "./delivery-log-service";
import { shouldApplyDeliveryStatus } from "./delivery-status-progress";
import { recomputeCampaignCountersFor } from "./campaign-counter-service";
import type { NormalizedEmailEvent } from "./providers/elastic-email/webhook-events";
import { suppressEmailRecipient } from "./email-suppression";

/**
 * Processes normalized Elastic Email delivery events: stores each as an idempotent
 * CommunicationProviderEvent and advances the matching CommunicationDelivery. Never throws —
 * webhooks must always answer 200 so the provider does not retry a poison payload forever.
 */

export type EmailWebhookSummary = {
  received: number;
  processed: number;
  duplicates: number;
  deliveryUpdates: number;
  unmatched: number;
  campaignUpdates: number;
  /** Recipients opted out by this batch (unsubscribe / complaint / hard bounce). */
  suppressed: number;
};

async function recordEvent(data: {
  deliveryId: string | null;
  eventType: string;
  providerMessageId: string;
  recipient: string | null;
  status: string;
  errorMessage: string | null;
  idempotencyKey: string;
  payloadSanitized: Prisma.InputJsonValue;
}): Promise<boolean> {
  try {
    // `idempotencyKey` carries `@unique` in schema.prisma, but on MongoDB that constraint only
    // exists once the index has actually been created on the database. It had not been, so P2002
    // never fired and the 15-minute event-sync cron re-inserted every event it saw on every run —
    // 864 stored rows for 76 distinct events. Checking first makes the guard hold regardless of
    // index state; the P2002 catch below stays as the race backstop for when the index does exist.
    const seen = await prisma.communicationProviderEvent
      .findFirst({ where: { idempotencyKey: data.idempotencyKey }, select: { id: true } })
      .catch(() => null);
    if (seen) return false;

    await prisma.communicationProviderEvent.create({
      data: {
        deliveryId: data.deliveryId,
        channel: "EMAIL",
        provider: "ELASTIC_EMAIL",
        eventType: data.eventType,
        providerMessageId: data.providerMessageId,
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
    console.error("recordEmailEvent failed", error);
    return false;
  }
}

export async function processElasticEmailEvents(events: NormalizedEmailEvent[]): Promise<EmailWebhookSummary> {
  const summary: EmailWebhookSummary = { received: events.length, processed: 0, duplicates: 0, deliveryUpdates: 0, unmatched: 0, campaignUpdates: 0, suppressed: 0 };
  if (!process.env.DATABASE_URL) return summary;

  // Campaigns whose deliveries moved in this batch. Their headline counters were written from the
  // provider's *acceptance* at send time, so every correction applied below leaves the campaign
  // header overstating success until it is re-derived.
  const touchedCampaigns = new Set<string>();

  for (const event of events) {
    const delivery = await prisma.communicationDelivery
      .findFirst({ where: { providerMessageId: event.providerMessageId }, select: { id: true, status: true, campaignId: true } })
      .catch(() => null);

    const inserted = await recordEvent({
      deliveryId: delivery?.id ?? null,
      eventType: event.eventType,
      providerMessageId: event.providerMessageId,
      recipient: event.recipient,
      status: event.status,
      errorMessage: event.errorMessage,
      idempotencyKey: event.idempotencyKey,
      payloadSanitized: {
        kind: "status",
        status: event.status,
        recipient: event.recipient,
        occurredAt: event.occurredAt,
        error: event.errorMessage,
      },
    });
    if (!inserted) {
      summary.duplicates += 1;
      continue;
    }
    summary.processed += 1;

    // Consent is a fact about the ADDRESS, so it is applied before the delivery
    // lookup — an unsubscribe still has to stop future mail even when the
    // message it arrived on belongs to no delivery row we can find (a send from
    // before this system, or one whose providerMessageId was never stored).
    if (event.suppression !== "none") {
      const result = await suppressEmailRecipient(event.recipient, event.suppression);
      if (result.applied) summary.suppressed += 1;
    }

    if (!delivery) {
      summary.unmatched += 1;
      continue;
    }
    if (!shouldApplyDeliveryStatus(delivery.status, event.status)) continue;

    const res = await markDeliveryStatus(delivery.id, event.status, {
      providerMessageId: event.providerMessageId,
      errorMessage: event.errorMessage,
    });
    if (res.ok) {
      summary.deliveryUpdates += 1;
      if (delivery.campaignId) touchedCampaigns.add(delivery.campaignId);
    }
  }

  summary.campaignUpdates = await recomputeCampaignCountersFor(touchedCampaigns).catch(() => 0);
  return summary;
}
