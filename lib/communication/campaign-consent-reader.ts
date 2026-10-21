import { prisma } from "@/lib/prisma";
import { recipientExclusionReason, type AudienceChannel } from "./campaign-audience-accounting";

type ConsentRow = { id: string; userId: string; doNotContact: boolean; emailOptIn: boolean; smsOptIn: boolean; whatsappOptIn: boolean };

/**
 * Resolve the profile gate, not contact readiness. For WhatsApp, return DNC
 * user IDs to exclude; for email/SMS, return user IDs with channel opt-in.
 * Required Boolean fields receive
 * Prisma's model defaults on read, including legacy missing fields. This avoids
 * unsupported BoolFilter.isSet and does not manufacture or update preferences.
 * Used only when an operator explicitly selects a readiness filter.
 */
export async function readCampaignProfileGateUserIds(channel: AudienceChannel, signal?: AbortSignal): Promise<string[]> {
  signal?.throwIfAborted();
  const last = await prisma.donorCommunicationProfile.findFirst({ orderBy: { id: "desc" }, select: { id: true } });
  if (!last) return [];
  const ids = new Set<string>();
  let cursor: string | null = null;
  while (true) {
    signal?.throwIfAborted();
    const rows: ConsentRow[] = await prisma.donorCommunicationProfile.findMany({
      where: { id: { lte: last.id, ...(cursor ? { gt: cursor } : {}) } },
      orderBy: { id: "asc" }, take: 1000,
      select: { id: true, userId: true, doNotContact: true, emailOptIn: true, smsOptIn: true, whatsappOptIn: true },
    });
    if (!rows.length) break;
    for (const profile of rows) {
      // Presence-only sentinels: the actual donor contact is filtered by the
      // candidate query. These values are never stored or sent to a provider.
      const reason = recipientExclusionReason({ email: "present", phone: "present" }, channel, profile);
      if (channel === "WHATSAPP" ? reason === "DO_NOT_CONTACT" : reason === null) ids.add(profile.userId);
    }
    const next: string = rows[rows.length - 1].id;
    if (cursor && next <= cursor) throw new Error("CONSENT_CURSOR_NOT_ADVANCING");
    cursor = next;
    if (rows.length < 1000) break;
  }
  signal?.throwIfAborted();
  return [...ids];
}

