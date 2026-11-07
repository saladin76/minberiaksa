import { prisma } from "@/lib/prisma";
import { recipientExclusionReason, type AudienceChannel } from "./campaign-audience-accounting";

type ConsentRow = { id: string; userId: string; doNotContact: boolean; emailOptIn: boolean; smsOptIn: boolean; consentSource: string | null };

/**
 * Resolve channel readiness without writing preferences. Missing WhatsApp profiles remain eligible;
 * explicit STOP profiles and platform-wide blocks do not. Used only when an operator selects a
 * readiness filter.
 */
export async function readCampaignConsentUserIds(channel: AudienceChannel, signal?: AbortSignal): Promise<string[]> {
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
      select: { id: true, userId: true, doNotContact: true, emailOptIn: true, smsOptIn: true, consentSource: true },
    });
    if (!rows.length) break;
    for (const profile of rows) {
      // Presence-only sentinels: the actual donor contact is filtered by the
      // candidate query. These values are never stored or sent to a provider.
      if (recipientExclusionReason({ email: "present", phone: "present" }, channel, profile) === null) ids.add(profile.userId);
    }
    const next: string = rows[rows.length - 1].id;
    if (cursor && next <= cursor) throw new Error("CONSENT_CURSOR_NOT_ADVANCING");
    cursor = next;
    if (rows.length < 1000) break;
  }
  if (channel === "WHATSAPP" || channel === "EMAIL") {
    let userCursor: string | null = null;
    while (true) {
      signal?.throwIfAborted();
      const users: Array<{ id: string }> = await prisma.user.findMany({
        where: {
          role: "DONOR",
          communicationProfile: null,
          ...(userCursor ? { id: { gt: userCursor } } : {}),
        },
        orderBy: { id: "asc" },
        take: 1000,
        select: { id: true },
      });
      if (!users.length) break;
      for (const user of users) ids.add(user.id);
      const next = users[users.length - 1].id;
      if (userCursor && next <= userCursor) throw new Error("AUDIENCE_CURSOR_NOT_ADVANCING");
      userCursor = next;
      if (users.length < 1000) break;
    }
  }
  signal?.throwIfAborted();
  return [...ids];
}
