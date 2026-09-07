import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";

type Actor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null } | null;

/**
 * Derives WhatsApp conversations from the existing archive — outbound CommunicationDelivery rows
 * and inbound/status CommunicationProviderEvent rows — grouped by contact phone. No dedicated
 * conversation table is needed. Donor matching is by phone only; ambiguous/absent matches are
 * surfaced as unresolved contacts (never randomly attached).
 */

function digits(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

export type ConversationDonor = {
  userId: string | null;
  name: string | null;
  email: string | null;
  locale: string | null;
  country: string | null;
  totalDonations: number | null;
  lastDonationAt: string | null;
  whatsappOptIn: boolean;
  doNotContact: boolean;
};

/** Which real WhatsApp number a conversation arrived on (never a raw phoneNumberId in the UI). */
export type ConversationSender = { id: string; name: string; phone: string | null };

export type ConversationSummary = {
  phone: string;
  donor: ConversationDonor | null;
  unresolved: boolean;
  handled: boolean;
  lastMessageAt: string | null;
  lastInboundText: string | null;
  needsReply: boolean;
  inboundCount: number;
  outboundCount: number;
  sender: ConversationSender | null;
};

const HANDLED_ACTION = "communication.conversation.handled";

type Bucket = {
  phone: string;
  lastInboundAt: number;
  lastOutboundAt: number;
  lastInboundText: string | null;
  inboundCount: number;
  outboundCount: number;
  senderId: string | null;
  senderAt: number; // timestamp of the event that set senderId (prefer the most recent inbound)
};

/**
 * Real WhatsApp senders for the inbox number filter. Returns display info only — never a raw
 * phoneNumberId. Uses CommunicationSender data (no fake/demo numbers).
 */
export async function listInboxSenders(): Promise<ConversationSender[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const rows = await prisma.communicationSender.findMany({
      where: { channel: "WHATSAPP" },
      select: { id: true, name: true, displayName: true, displayPhoneNumber: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
    return rows.map((s) => ({ id: s.id, name: s.displayName || s.name, phone: s.displayPhoneNumber ?? null }));
  } catch (error) {
    console.error("listInboxSenders failed", error);
    return [];
  }
}

async function senderMap(): Promise<Map<string, ConversationSender>> {
  const senders = await listInboxSenders();
  return new Map(senders.map((s) => [s.id, s]));
}

async function matchDonors(phoneDigits: string[]): Promise<Map<string, ConversationDonor[]>> {
  const map = new Map<string, ConversationDonor[]>();
  if (phoneDigits.length === 0 || !process.env.DATABASE_URL) return map;
  const variants = phoneDigits.flatMap((d) => [d, `+${d}`]);
  try {
    const profiles = await prisma.donorCommunicationProfile.findMany({
      where: { phone: { in: variants } },
      select: { userId: true, phone: true, email: true, preferredLocale: true, countryCode: true, totalDonations: true, lastDonationAt: true, whatsappOptIn: true, doNotContact: true },
      take: 1000,
    });
    // Names live on the User row, not the profile — join them in.
    const userIds = Array.from(new Set(profiles.map((p) => p.userId).filter(Boolean) as string[]));
    const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }).catch(() => []) : [];
    const nameById = new Map(users.map((u) => [u.id, u.name]));
    for (const p of profiles) {
      const key = digits(p.phone);
      const donor: ConversationDonor = {
        userId: p.userId,
        name: p.userId ? nameById.get(p.userId) ?? null : null,
        email: p.email,
        locale: p.preferredLocale,
        country: p.countryCode,
        totalDonations: p.totalDonations,
        lastDonationAt: p.lastDonationAt ? p.lastDonationAt.toISOString() : null,
        whatsappOptIn: p.whatsappOptIn,
        doNotContact: p.doNotContact,
      };
      map.set(key, [...(map.get(key) ?? []), donor]);
    }
  } catch (error) {
    console.error("matchDonors failed", error);
  }
  return map;
}

export async function listConversations(opts: { senderId?: string | null } = {}): Promise<ConversationSummary[]> {
  if (!process.env.DATABASE_URL) return [];
  const [inbound, outbound] = await Promise.all([
    prisma.communicationProviderEvent
      .findMany({ where: { channel: "WHATSAPP", eventType: "inbound_message" }, orderBy: { receivedAt: "desc" }, take: 500, select: { recipient: true, receivedAt: true, payloadSanitized: true, senderId: true } })
      .catch(() => []),
    prisma.communicationDelivery
      .findMany({ where: { channel: "WHATSAPP", recipientPhone: { not: null } }, orderBy: { createdAt: "desc" }, take: 500, select: { recipientPhone: true, createdAt: true, senderId: true } })
      .catch(() => []),
  ]);

  const buckets = new Map<string, Bucket>();
  const ensure = (phone: string) => {
    const key = digits(phone);
    let b = buckets.get(key);
    if (!b) {
      b = { phone: phone, lastInboundAt: 0, lastOutboundAt: 0, lastInboundText: null, inboundCount: 0, outboundCount: 0, senderId: null, senderAt: 0 };
      buckets.set(key, b);
    }
    return b;
  };

  for (const ev of inbound) {
    if (!ev.recipient) continue;
    const b = ensure(ev.recipient);
    const at = ev.receivedAt?.getTime() ?? 0;
    b.inboundCount += 1;
    if (at >= b.lastInboundAt) {
      b.lastInboundAt = at;
      const p = ev.payloadSanitized as { text?: unknown } | null;
      b.lastInboundText = p && typeof p.text === "string" ? p.text : b.lastInboundText;
    }
    // "Received on" is attributed to the most recent event that carries a senderId (inbound preferred).
    if (ev.senderId && at >= b.senderAt) {
      b.senderId = ev.senderId;
      b.senderAt = at;
    }
  }
  for (const d of outbound) {
    if (!d.recipientPhone) continue;
    const b = ensure(d.recipientPhone);
    const at = d.createdAt?.getTime() ?? 0;
    b.outboundCount += 1;
    b.lastOutboundAt = Math.max(b.lastOutboundAt, at);
    // Fallback sender attribution from outbound only when no inbound sender is known yet.
    if (d.senderId && b.senderAt === 0) {
      b.senderId = d.senderId;
      b.senderAt = at;
    }
  }

  const [donorMap, handledMap, senders] = await Promise.all([matchDonors([...buckets.keys()]), loadHandledMarkers(), senderMap()]);

  let summaries: ConversationSummary[] = [...buckets.values()].map((b) => {
    const key = digits(b.phone);
    const matches = donorMap.get(key) ?? [];
    const unresolved = matches.length !== 1;
    const donor = matches.length === 1 ? matches[0] : null;
    const lastAt = Math.max(b.lastInboundAt, b.lastOutboundAt);
    // A conversation is "handled" only if a handled marker is newer than the last inbound message
    // (a new inbound reply automatically re-opens it).
    const handledAt = handledMap.get(key) ?? 0;
    const handled = handledAt > 0 && handledAt >= b.lastInboundAt;
    return {
      phone: b.phone,
      donor,
      unresolved,
      handled,
      lastMessageAt: lastAt ? new Date(lastAt).toISOString() : null,
      lastInboundText: b.lastInboundText,
      needsReply: b.lastInboundAt > b.lastOutboundAt && !handled,
      inboundCount: b.inboundCount,
      outboundCount: b.outboundCount,
      sender: b.senderId ? senders.get(b.senderId) ?? null : null,
    };
  });

  // Optional filter by the real WhatsApp number the conversation arrived on.
  if (opts.senderId) summaries = summaries.filter((c) => c.sender?.id === opts.senderId);

  summaries.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
  return summaries;
}

export type TimelineItem = {
  kind: "inbound" | "outbound" | "status";
  at: string | null;
  text: string | null;
  status: string | null;
};

export type ConversationDetail = {
  phone: string;
  donor: ConversationDonor | null;
  unresolved: boolean;
  timeline: TimelineItem[];
  sender: ConversationSender | null;
};

export async function getConversation(phone: string): Promise<ConversationDetail | null> {
  if (!process.env.DATABASE_URL) return null;
  const target = digits(phone);
  const variants = [target, `+${target}`];

  const [events, deliveries, donorMap, senders] = await Promise.all([
    prisma.communicationProviderEvent.findMany({ where: { channel: "WHATSAPP", recipient: { in: variants } }, orderBy: { receivedAt: "asc" }, take: 500, select: { eventType: true, receivedAt: true, status: true, payloadSanitized: true, senderId: true } }).catch(() => []),
    prisma.communicationDelivery.findMany({ where: { channel: "WHATSAPP", recipientPhone: { in: variants } }, orderBy: { createdAt: "asc" }, take: 500, select: { createdAt: true, renderedBody: true, status: true, senderId: true } }).catch(() => []),
    matchDonors([target]),
    senderMap(),
  ]);

  const timeline: TimelineItem[] = [];
  for (const d of deliveries) {
    timeline.push({ kind: "outbound", at: d.createdAt?.toISOString() ?? null, text: d.renderedBody ?? null, status: d.status });
  }
  // Resolve the number this conversation arrived on: most recent inbound event with a senderId, else outbound.
  let senderId: string | null = null;
  let senderAt = 0;
  for (const ev of events) {
    if (ev.eventType === "inbound_message") {
      const p = ev.payloadSanitized as { text?: unknown } | null;
      timeline.push({ kind: "inbound", at: ev.receivedAt?.toISOString() ?? null, text: p && typeof p.text === "string" ? p.text : null, status: null });
    } else {
      timeline.push({ kind: "status", at: ev.receivedAt?.toISOString() ?? null, text: null, status: ev.status ?? ev.eventType });
    }
    const at = ev.receivedAt?.getTime() ?? 0;
    if (ev.senderId && at >= senderAt) { senderId = ev.senderId; senderAt = at; }
  }
  if (!senderId) {
    for (const d of deliveries) if (d.senderId) { senderId = d.senderId; break; }
  }
  timeline.sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));

  const matches = donorMap.get(target) ?? [];
  return { phone, donor: matches.length === 1 ? matches[0] : null, unresolved: matches.length !== 1, timeline, sender: senderId ? senders.get(senderId) ?? null : null };
}

/** Latest handled-marker time per phone (digits key). */
async function loadHandledMarkers(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!process.env.DATABASE_URL) return map;
  try {
    const rows = await prisma.auditLog.findMany({
      where: { entityType: "CommunicationConversation", action: HANDLED_ACTION },
      orderBy: { createdAt: "desc" },
      take: 800,
      select: { entityId: true, createdAt: true },
    });
    for (const r of rows) {
      const key = digits(r.entityId);
      if (key && !map.has(key)) map.set(key, r.createdAt?.getTime() ?? 0); // desc → first seen is latest
    }
  } catch (error) {
    console.error("loadHandledMarkers failed", error);
  }
  return map;
}

/** Mark a conversation handled (audit-backed; a new inbound reply re-opens it automatically). */
export async function markConversationHandled(phone: string, actor?: Actor): Promise<{ ok: boolean }> {
  const key = digits(phone);
  await writeAuditLog({
    actorId: actor?.actorId ?? undefined,
    actorName: actor?.actorName ?? undefined,
    actorRole: actor?.actorRole ?? "ADMIN",
    action: HANDLED_ACTION,
    messageAr: `تم التعامل مع محادثة واتساب`,
    messageEn: `WhatsApp conversation marked handled`,
    entityType: "CommunicationConversation",
    entityId: key,
    metadata: { phone, externalCall: false },
    stream: "TEAM",
  });
  return { ok: true };
}

/** Record a follow-up or link request against a conversation (audit-backed, no DB attach faked). */
export async function logConversationAction(phone: string, action: "followup" | "link", actor?: Actor): Promise<{ ok: boolean }> {
  const key = digits(phone);
  const meta =
    action === "followup"
      ? { a: "communication.conversation.followup", ar: "طلب مهمة متابعة لمحادثة واتساب", en: "WhatsApp conversation follow-up requested" }
      : { a: "communication.conversation.link-requested", ar: "طلب ربط محادثة واتساب بمتبرع", en: "WhatsApp conversation link-to-donor requested" };
  await writeAuditLog({
    actorId: actor?.actorId ?? undefined,
    actorName: actor?.actorName ?? undefined,
    actorRole: actor?.actorRole ?? "ADMIN",
    action: meta.a,
    messageAr: meta.ar,
    messageEn: meta.en,
    entityType: "CommunicationConversation",
    entityId: key,
    metadata: { phone, externalCall: false },
    stream: "TEAM",
  });
  return { ok: true };
}
