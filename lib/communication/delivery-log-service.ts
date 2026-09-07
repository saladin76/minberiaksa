import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  isProviderSuccessStatus,
  type CommunicationChannelId,
  type CommunicationProviderId,
  type CommunicationPurposeId,
  type DeliveryOriginId,
  type DeliveryStatusId,
} from "./communication-runtime-types";

/**
 * DeliveryLogService — the new archive layer for the Communication Center.
 *
 * Every outgoing message (manual, trigger, campaign, test, reactivation, system) gets a
 * CommunicationDelivery record created at render time, BEFORE any provider call. The record
 * is then advanced as the real provider responds. This package does not call any provider —
 * it only provides the safe create/update/query foundation.
 *
 * Hard rule: a delivery may only enter a provider-success status (SENT / DELIVERED / …) when
 * a real providerMessageId is supplied. Missing provider config → SKIPPED/FAILED with a reason,
 * never a fake SENT. Legacy `SentMessage` is untouched and remains the legacy archive.
 */

export type CreateDeliveryInput = {
  channel: CommunicationChannelId;
  provider?: CommunicationProviderId | null;
  senderId?: string | null;
  campaignId?: string | null;
  templateId?: string | null;
  templateName?: string | null;
  recipientUserId?: string | null;
  recipientPhone?: string | null;
  recipientEmail?: string | null;
  recipientName?: string | null;
  locale?: string | null;
  purpose?: CommunicationPurposeId;
  origin?: DeliveryOriginId;
  renderedSubject?: string | null;
  renderedBody?: string | null;
  variables?: Record<string, unknown> | null;
  createdBy?: string | null;
  /** Initial status — defaults to RENDERED. Provider-success statuses are rejected here. */
  status?: DeliveryStatusId;
};

export type ServiceResult<T = { id: string }> = { ok: true; data: T } | { ok: false; status: number; error: string };

function dbUnavailable(): { ok: false; status: number; error: string } {
  return { ok: false, status: 503, error: "DATABASE_URL is not configured; delivery not recorded." };
}

/** Create a delivery record before sending. Never accepts a provider-success status at creation. */
export async function createDeliveryRecord(input: CreateDeliveryInput): Promise<ServiceResult> {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  const requested = input.status ?? "RENDERED";
  // A brand-new record can never claim the provider already succeeded.
  const status: DeliveryStatusId = isProviderSuccessStatus(requested) ? "RENDERED" : requested;
  try {
    const row = await prisma.communicationDelivery.create({
      data: {
        channel: input.channel,
        provider: input.provider ?? null,
        senderId: input.senderId ?? null,
        campaignId: input.campaignId ?? null,
        templateId: input.templateId ?? null,
        templateName: input.templateName ?? null,
        recipientUserId: input.recipientUserId ?? null,
        recipientPhone: input.recipientPhone ?? null,
        recipientEmail: input.recipientEmail ?? null,
        recipientName: input.recipientName ?? null,
        locale: input.locale ?? null,
        purpose: input.purpose ?? "TRANSACTIONAL",
        origin: input.origin ?? "SYSTEM",
        status,
        renderedSubject: input.renderedSubject ?? null,
        renderedBody: input.renderedBody ?? null,
        variables: (input.variables ?? undefined) as Prisma.InputJsonValue | undefined,
        createdBy: input.createdBy ?? null,
      },
      select: { id: true },
    });
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    console.error("createDeliveryRecord failed", error);
    return { ok: false, status: 500, error: "Failed to record delivery." };
  }
}

/** Record a recipient that was intentionally not sent (missing provider/consent/sender/etc.). */
export async function recordSkippedDelivery(input: CreateDeliveryInput, reason: string): Promise<ServiceResult> {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  try {
    const row = await prisma.communicationDelivery.create({
      data: {
        channel: input.channel,
        provider: input.provider ?? null,
        senderId: input.senderId ?? null,
        campaignId: input.campaignId ?? null,
        templateId: input.templateId ?? null,
        templateName: input.templateName ?? null,
        recipientUserId: input.recipientUserId ?? null,
        recipientPhone: input.recipientPhone ?? null,
        recipientEmail: input.recipientEmail ?? null,
        recipientName: input.recipientName ?? null,
        locale: input.locale ?? null,
        purpose: input.purpose ?? "TRANSACTIONAL",
        origin: input.origin ?? "SYSTEM",
        status: "SKIPPED",
        renderedSubject: input.renderedSubject ?? null,
        renderedBody: input.renderedBody ?? null,
        variables: (input.variables ?? undefined) as Prisma.InputJsonValue | undefined,
        errorMessage: reason,
        failedAt: new Date(),
        createdBy: input.createdBy ?? null,
      },
      select: { id: true },
    });
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    console.error("recordSkippedDelivery failed", error);
    return { ok: false, status: 500, error: "Failed to record skipped delivery." };
  }
}

export type DeliveryStatusPatch = {
  providerMessageId?: string | null;
  providerConversationId?: string | null;
  errorMessage?: string | null;
  /**
   * Set true only when the provider accepted the send but returns no external message id
   * (e.g. SendGrid). The delivery may then advance to SENT with a null providerMessageId — this
   * still reflects a real acceptance, never a fake success.
   */
  internalAccepted?: boolean;
};

/**
 * Advance a delivery's status after a provider response. Provider-success statuses require either a
 * real `providerMessageId` or an explicit `internalAccepted` flag — otherwise the update is rejected
 * (never fake SENT). Timestamps are set from the status.
 */
export async function markDeliveryStatus(
  id: string,
  status: DeliveryStatusId,
  patch: DeliveryStatusPatch = {}
): Promise<ServiceResult> {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  if (isProviderSuccessStatus(status) && !patch.providerMessageId && !patch.internalAccepted) {
    return { ok: false, status: 400, error: `Cannot mark ${status} without provider acceptance.` };
  }
  const now = new Date();
  const timestamps: Record<string, Date> = {};
  if (status === "SENT" || status === "SENT_TO_PROVIDER") timestamps.sentAt = now;
  if (status === "DELIVERED") timestamps.deliveredAt = now;
  if (status === "READ") timestamps.readAt = now;
  if (status === "OPENED") timestamps.openedAt = now;
  if (status === "CLICKED") timestamps.clickedAt = now;
  if (status === "REPLIED") timestamps.repliedAt = now;
  if (status === "FAILED" || status === "BOUNCED" || status === "SKIPPED") timestamps.failedAt = now;
  try {
    await prisma.communicationDelivery.update({
      where: { id },
      data: {
        status,
        providerMessageId: patch.providerMessageId ?? undefined,
        providerConversationId: patch.providerConversationId ?? undefined,
        errorMessage: patch.errorMessage ?? undefined,
        ...timestamps,
      },
    });
    return { ok: true, data: { id } };
  } catch (error) {
    console.error("markDeliveryStatus failed", error);
    return { ok: false, status: 500, error: "Failed to update delivery status." };
  }
}

export type DeliveryListFilter = {
  channel?: CommunicationChannelId;
  provider?: string;
  status?: DeliveryStatusId;
  campaignId?: string;
  senderId?: string;
  recipientUserId?: string;
  locale?: string;
  from?: Date;
  to?: Date;
  take?: number;
};

/** Read-only delivery log query (backs the Delivery Logs page). */
export async function listDeliveries(filter: DeliveryListFilter = {}) {
  if (!process.env.DATABASE_URL) return [];
  try {
    const createdAt = filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined;
    return await prisma.communicationDelivery.findMany({
      where: {
        channel: filter.channel,
        provider: filter.provider,
        status: filter.status,
        campaignId: filter.campaignId,
        senderId: filter.senderId,
        recipientUserId: filter.recipientUserId,
        locale: filter.locale,
        createdAt,
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(filter.take ?? 100, 500),
    });
  } catch (error) {
    console.error("listDeliveries failed", error);
    return [];
  }
}

export type ProviderEventListFilter = {
  provider?: string;
  channel?: CommunicationChannelId;
  eventType?: string;
  status?: string;
  from?: Date;
  to?: Date;
  take?: number;
};

/** Read-only provider-event query. Only the sanitized payload is ever stored/returned. */
export async function listProviderEvents(filter: ProviderEventListFilter = {}) {
  if (!process.env.DATABASE_URL) return [];
  try {
    const receivedAt = filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined;
    return await prisma.communicationProviderEvent.findMany({
      where: {
        provider: filter.provider,
        channel: filter.channel,
        eventType: filter.eventType,
        status: filter.status,
        receivedAt,
      },
      orderBy: { receivedAt: "desc" },
      take: Math.min(filter.take ?? 100, 500),
    });
  } catch (error) {
    console.error("listProviderEvents failed", error);
    return [];
  }
}
