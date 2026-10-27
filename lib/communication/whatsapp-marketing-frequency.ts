import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { normalizePhoneE164, phoneMatchVariants } from "./phone";

import { prisma } from "@/lib/prisma";
import {
  MAX_WHATSAPP_MARKETING_COOLDOWN_DAYS,
  MIN_WHATSAPP_MARKETING_COOLDOWN_DAYS,
  readCampaignGlobalControls,
} from "./campaign-send-controls";

export type WhatsAppMarketingReservation = {
  userId: string | null;
  reservedAt: Date;
  previousAt: Date | null;
  reserved: boolean;
  contactId?: string; contactToken?: string; contactPreviousAt?: Date | null;
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
  phone?: string | null,
): Promise<WhatsAppMarketingReservationResult> {
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

  // Zero is the admin-controlled "no limit" setting. Do not reserve a timestamp
  // in that mode; doing so would reintroduce an implicit per-recipient send gate.
  if (cooldownDays === 0) {
    return { ok: true, reservation: { userId: userId ?? null, reservedAt: now, previousAt: null, reserved: false } };
  }
  if (!userId) return { ok: false, reason: "WHATSAPP_FREQUENCY_CHECK_UNAVAILABLE" };

  const cutoff = new Date(now.getTime() - cooldownDays * 24 * 60 * 60 * 1000);
  let previousAt: Date | null;
  try {
    // Frequency state lives on the donor profile. Create a minimal row when needed;
    // this deliberately leaves all communication preferences at their defaults.
    await prisma.donorCommunicationProfile.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { userId: true },
    });
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
        OR: [{ recipientUserId: userId }, ...(phone ? [{ recipientPhone: { in: phoneMatchVariants(phone) } }] : [])],
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
    const reservation: WhatsAppMarketingReservation = { userId, reservedAt, previousAt, reserved: true };
    const canonical = normalizePhoneE164(phone);
    if (canonical) {
      try {
        const contactId = createHash("sha256").update("whatsapp:" + canonical).digest("hex").slice(0, 24);
        const token = randomUUID();
        await prisma.communicationContactFrequency.upsert({ where: { id: contactId }, create: { id: contactId }, update: {} });
        const contact = await prisma.communicationContactFrequency.findUnique({ where: { id: contactId }, select: { lastSentAt: true } });
        const lock = await prisma.communicationContactFrequency.updateMany({ where: { id: contactId, OR: [{ lastSentAt: null }, { lastSentAt: { isSet: false } }, { lastSentAt: { lte: cutoff } }] }, data: { lastSentAt: reservedAt, reservationToken: token } });
        if (lock.count !== 1) { await releaseWhatsappMarketingReservation(reservation); return { ok: false, reason: "WHATSAPP_MARKETING_COOLDOWN" }; }
        reservation.contactId = contactId; reservation.contactToken = token; reservation.contactPreviousAt = contact?.lastSentAt ?? null;
      } catch { await releaseWhatsappMarketingReservation(reservation); return { ok: false, reason: "WHATSAPP_FREQUENCY_CHECK_UNAVAILABLE" }; }
    }
    return { ok: true, reservation };
  } catch {
    return { ok: false, reason: "WHATSAPP_FREQUENCY_CHECK_UNAVAILABLE" };
  }
}

/** Restore the prior timestamp only when this call still owns the reservation. */
export async function releaseWhatsappMarketingReservation(
  reservation: WhatsAppMarketingReservation,
): Promise<void> {
  if (!reservation.reserved || !reservation.userId) return;
  if (reservation.contactId && reservation.contactToken) await prisma.communicationContactFrequency.updateMany({ where: { id: reservation.contactId, reservationToken: reservation.contactToken }, data: { lastSentAt: reservation.contactPreviousAt ?? null, reservationToken: null } }).catch(() => undefined);
  await prisma.donorCommunicationProfile.updateMany({
    where: { userId: reservation.userId, lastWhatsappMarketingAt: reservation.reservedAt },
    data: { lastWhatsappMarketingAt: reservation.previousAt },
  }).catch(() => undefined);
}

