import "server-only";

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_WHATSAPP_MARKETING_COOLDOWN_DAYS,
  MAX_WHATSAPP_MARKETING_COOLDOWN_DAYS,
  MIN_WHATSAPP_MARKETING_COOLDOWN_DAYS,
  readCampaignGlobalControls,
} from "./campaign-send-controls";

export type WhatsAppMarketingReservation = {
  userId: string;
  reservedAt: Date;
  previousAt: Date | null;
};

export type WhatsAppMarketingReservationResult =
  | { ok: true; reservation: WhatsAppMarketingReservation }
  | { ok: false; reason: "WHATSAPP_MARKETING_COOLDOWN" | "WHATSAPP_FREQUENCY_CHECK_UNAVAILABLE" };

export async function loadWhatsappMarketingCooldownDays(): Promise<number | null> {
  const result = await readCampaignGlobalControls();
  return result.ok ? result.controls.whatsappMarketingCooldownDays : null;
}

export async function reserveWhatsappMarketingSend(
  userId: string | null | undefined,
  now = new Date(),
): Promise<WhatsAppMarketingReservationResult> {
  if (!userId) return { ok: false, reason: "WHATSAPP_FREQUENCY_CHECK_UNAVAILABLE" };
  const global = await readCampaignGlobalControls();
  if (!global.ok) return { ok: false, reason: "WHATSAPP_FREQUENCY_CHECK_UNAVAILABLE" };

  const cooldownDays = global.controls.whatsappMarketingCooldownDays;
  if (
    !Number.isInteger(cooldownDays) ||
    cooldownDays < MIN_WHATSAPP_MARKETING_COOLDOWN_DAYS ||
    cooldownDays > MAX_WHATSAPP_MARKETING_COOLDOWN_DAYS
  ) {
    return { ok: false, reason: "WHATSAPP_FREQUENCY_CHECK_UNAVAILABLE" };
  }

  const cutoff = new Date(now.getTime() - cooldownDays * 24 * 60 * 60 * 1000);
  let previousAt: Date | null;
  try {
    const profile = await prisma.donorCommunicationProfile.findUnique({
      where: { userId },
      select: { lastWhatsappMarketingAt: true },
    });
    if (!profile) return { ok: false, reason: "WHATSAPP_FREQUENCY_CHECK_UNAVAILABLE" };
    previousAt = profile.lastWhatsappMarketingAt ?? null;
    if (previousAt && previousAt > cutoff) {
      return { ok: false, reason: "WHATSAPP_MARKETING_COOLDOWN" };
    }

    const priorSend = await prisma.communicationDelivery.findFirst({
      where: {
        channel: "WHATSAPP",
        purpose: "MARKETING",
        recipientUserId: userId,
        sentAt: { gt: cutoff },
      },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true },
    });
    if (priorSend?.sentAt && priorSend.sentAt > cutoff) {
      return { ok: false, reason: "WHATSAPP_MARKETING_COOLDOWN" };
    }

    const reservedAt = new Date(now);
    const claimed = await prisma.donorCommunicationProfile.updateMany({
      where: {
        userId,
        OR: [
          { lastWhatsappMarketingAt: null },
          { lastWhatsappMarketingAt: { isSet: false } },
          { lastWhatsappMarketingAt: { lte: cutoff } },
        ],
      },
      data: { lastWhatsappMarketingAt: reservedAt },
    });
    if (claimed.count !== 1) {
      return { ok: false, reason: "WHATSAPP_MARKETING_COOLDOWN" };
    }
    return { ok: true, reservation: { userId, reservedAt, previousAt } };
  } catch {
    return { ok: false, reason: "WHATSAPP_FREQUENCY_CHECK_UNAVAILABLE" };
  }
}

/** Restore the prior timestamp only when this call still owns the reservation. */
export async function releaseWhatsappMarketingReservation(
  reservation: WhatsAppMarketingReservation,
): Promise<void> {
  await prisma.donorCommunicationProfile.updateMany({
    where: { userId: reservation.userId, lastWhatsappMarketingAt: reservation.reservedAt },
    data: { lastWhatsappMarketingAt: reservation.previousAt },
  }).catch(() => undefined);
}

