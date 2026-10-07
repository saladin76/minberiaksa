import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import { normalizePhoneE164, phoneDigits, phoneMatchVariants } from "./phone";
import type { WhatsappRenderedPreview } from "./whatsapp-rendered-preview";

type Actor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null } | null;

/**
 * WhatsApp conversations, derived from the archive  outbound `CommunicationDelivery` rows and
 * inbound/status `CommunicationProviderEvent` rows. No dedicated conversation table.
 *
 * **A conversation is a pair of numbers, not a contact.** It used to be keyed on the contact's digits
 * alone, so with two business numbers configured one donor's two genuinely separate threads were
 * merged into one: their reply to a campaign on the marketing number appeared to answer a receipt
 * sent from the transactional number, and "needs reply" was computed across both. The identity is now
 * `businessSenderId + contactE164`, which is what WhatsApp itself considers a thread.
 *
 * **The whole archive is counted, not the newest 500 rows.** Both queries used `take: 500` and grouped
 * in memory. Past ~500 messages that stops being a sample and becomes a lie: conversations older than
 * the cut simply vanished from the inbox, and the "needs reply" badge  which the dashboard and the
 * reports both read  silently undercounted. Grouping now happens in MongoDB, so every message is
 * counted and only one row per conversation crosses the wire.
 *
 * Donor matching is by phone only; ambiguous or absent matches are surfaced as unresolved contacts,
 * never attached at random.
 */

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
  /** `senderId:contactE164`  stable, and what the inbox routes on. */
  id: string;
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

/** No sender row claims this number  kept as its own bucket rather than merged into a real one. */
const UNKNOWN_SENDER = "unknown";

export function conversationId(senderId: string | null | undefined, phone: string | null | undefined): string {
  const contact = normalizePhoneE164(phone) ?? `+${phoneDigits(phone)}`;
  return `${senderId || UNKNOWN_SENDER}:${contact}`;
}

export function parseConversationId(id: string): { senderId: string | null; phone: string } {
  const separator = id.indexOf(":");
  if (separator < 0) return { senderId: null, phone: id };
  const senderId = id.slice(0, separator);
  return { senderId: senderId === UNKNOWN_SENDER ? null : senderId, phone: id.slice(separator + 1) };
}

type Bucket = {
  id: string;
  senderId: string | null;
  phone: string;
  lastInboundAt: number;
  lastOutboundAt: number;
  lastInboundText: string | null;
  inboundCount: number;
  outboundCount: number;
};

/**
 * Real WhatsApp senders for the inbox number filter. Returns display info only  never a raw
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

async function matchDonors(phoneDigitsList: string[]): Promise<Map<string, ConversationDonor[]>> {
  const map = new Map<string, ConversationDonor[]>();
  if (phoneDigitsList.length === 0 || !process.env.DATABASE_URL) return map;
  const variants = phoneDigitsList.flatMap((d) => [d, `+${d}`]);
  try {
    const profiles = await prisma.donorCommunicationProfile.findMany({
      where: { phone: { in: variants } },
      select: { userId: true, phone: true, email: true, preferredLocale: true, countryCode: true, totalDonations: true, lastDonationAt: true, whatsappOptIn: true, doNotContact: true },
      take: 1000,
    });
    // Names live on the User row, not the profile  join them in.
    const userIds = Array.from(new Set(profiles.map((p) => p.userId).filter(Boolean) as string[]));
    const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }).catch(() => []) : [];
    const nameById = new Map(users.map((u) => [u.id, u.name]));
    for (const p of profiles) {
      const key = phoneDigits(p.phone);
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

/* ── Aggregation ───────────────────────────────────────────────────────────────
   Grouping happens in the database. The result set is one row per (business number, contact
   spelling), which is bounded by the number of real conversations rather than by the number of
   messages  so a 100,000-message archive still returns a few hundred rows.

   Legacy rows hold the contact number in whatever spelling the provider sent (`905…`, `+905…`,
   punctuated). Mongo cannot strip punctuation in a `$group` key without a JS expression, so the group
   key is the stored string and the spellings are folded together here, where E.164 normalisation
   already lives. Nothing is dropped either way: every spelling comes back as its own row. */

type RawGroup = { _id: { senderId?: unknown; phone?: unknown }; count?: unknown; lastAt?: unknown; lastPayload?: unknown };

function rawDate(value: unknown): number {
  if (value && typeof value === "object" && "$date" in (value as Record<string, unknown>)) {
    const inner = (value as { $date: unknown }).$date;
    const ms = typeof inner === "string" ? Date.parse(inner) : typeof inner === "number" ? inner : NaN;
    return Number.isFinite(ms) ? ms : 0;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") { const ms = Date.parse(value); return Number.isFinite(ms) ? ms : 0; }
  return 0;
}

function groups(result: unknown): RawGroup[] {
  const batch = (result as { cursor?: { firstBatch?: unknown } } | null)?.cursor?.firstBatch;
  return Array.isArray(batch) ? (batch as RawGroup[]) : [];
}

async function aggregateInbound(): Promise<RawGroup[]> {
  const result = await prisma
    .$runCommandRaw({
      aggregate: "CommunicationProviderEvent",
      pipeline: [
        { $match: { channel: "WHATSAPP", eventType: "inbound_message" } },
        { $sort: { receivedAt: -1 } },
        {
          $group: {
            _id: { senderId: "$senderId", phone: "$recipient" },
            count: { $sum: 1 },
            lastAt: { $first: "$receivedAt" },
            lastPayload: { $first: "$payloadSanitized" },
          },
        },
      ],
      allowDiskUse: true,
      cursor: {},
    })
    .catch((error: unknown) => { console.error("aggregateInbound failed", error); return null; });
  return groups(result);
}

async function aggregateOutbound(): Promise<RawGroup[]> {
  const result = await prisma
    .$runCommandRaw({
      aggregate: "CommunicationDelivery",
      pipeline: [
        { $match: { channel: "WHATSAPP", recipientPhone: { $ne: null } } },
        {
          $group: {
            _id: { senderId: "$senderId", phone: "$recipientPhone" },
            count: { $sum: 1 },
            lastAt: { $max: "$createdAt" },
          },
        },
      ],
      allowDiskUse: true,
      cursor: {},
    })
    .catch((error: unknown) => { console.error("aggregateOutbound failed", error); return null; });
  return groups(result);
}

function objectIdString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "$oid" in (value as Record<string, unknown>)) {
    const oid = (value as { $oid: unknown }).$oid;
    return typeof oid === "string" ? oid : null;
  }
  return null;
}

export async function listConversations(opts: { senderId?: string | null } = {}): Promise<ConversationSummary[]> {
  if (!process.env.DATABASE_URL) return [];
  const [inbound, outbound] = await Promise.all([aggregateInbound(), aggregateOutbound()]);

  const buckets = new Map<string, Bucket>();
  const ensure = (senderId: string | null, phone: string): Bucket => {
    const id = conversationId(senderId, phone);
    let bucket = buckets.get(id);
    if (!bucket) {
      bucket = {
        id, senderId, phone: normalizePhoneE164(phone) ?? phone,
        lastInboundAt: 0, lastOutboundAt: 0, lastInboundText: null, inboundCount: 0, outboundCount: 0,
      };
      buckets.set(id, bucket);
    }
    return bucket;
  };

  for (const row of inbound) {
    const phone = typeof row._id?.phone === "string" ? row._id.phone : null;
    if (!phone) continue;
    const bucket = ensure(objectIdString(row._id?.senderId), phone);
    bucket.inboundCount += Number(row.count ?? 0);
    const at = rawDate(row.lastAt);
    if (at >= bucket.lastInboundAt) {
      bucket.lastInboundAt = at;
      const payload = row.lastPayload as { text?: unknown } | null;
      if (payload && typeof payload.text === "string") bucket.lastInboundText = payload.text;
    }
  }

  for (const row of outbound) {
    const phone = typeof row._id?.phone === "string" ? row._id.phone : null;
    if (!phone) continue;
    const bucket = ensure(objectIdString(row._id?.senderId), phone);
    bucket.outboundCount += Number(row.count ?? 0);
    bucket.lastOutboundAt = Math.max(bucket.lastOutboundAt, rawDate(row.lastAt));
  }

  const [donorMap, handledMap, senders] = await Promise.all([
    matchDonors([...new Set([...buckets.values()].map((b) => phoneDigits(b.phone)))]),
    loadHandledMarkers(),
    senderMap(),
  ]);

  let summaries: ConversationSummary[] = [...buckets.values()].map((bucket) => {
    const matches = donorMap.get(phoneDigits(bucket.phone)) ?? [];
    const lastAt = Math.max(bucket.lastInboundAt, bucket.lastOutboundAt);
    /* Handled only counts while it is newer than the last inbound message: a new reply re-opens the
       conversation on its own. A marker written against the contact alone (before conversations were
       per-number) still applies to every thread with that contact. */
    const handledAt = Math.max(handledMap.get(bucket.id) ?? 0, handledMap.get(phoneDigits(bucket.phone)) ?? 0);
    const handled = handledAt > 0 && handledAt >= bucket.lastInboundAt;
    return {
      id: bucket.id,
      phone: bucket.phone,
      donor: matches.length === 1 ? matches[0] : null,
      unresolved: matches.length !== 1,
      handled,
      lastMessageAt: lastAt ? new Date(lastAt).toISOString() : null,
      lastInboundText: bucket.lastInboundText,
      needsReply: bucket.lastInboundAt > bucket.lastOutboundAt && !handled,
      inboundCount: bucket.inboundCount,
      outboundCount: bucket.outboundCount,
      sender: bucket.senderId ? senders.get(bucket.senderId) ?? null : null,
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
  /** Inbound only: a non-text message the donor sent (image, voice note, document…). */
  media?: { kind: string; mediaId: string | null; mimeType: string | null; filename: string | null; caption: string | null } | null;
  /** Outbound only: frozen provider-approved WhatsApp message, including header/footer/buttons. */
  whatsappPreview?: WhatsappRenderedPreview | null;
};

export type ConversationDetail = {
  id: string;
  phone: string;
  donor: ConversationDonor | null;
  unresolved: boolean;
  timeline: TimelineItem[];
  sender: ConversationSender | null;
  /** True when older messages exist beyond the page returned. */
  hasMore: boolean;
  /** Pass as `before` to fetch the previous page. */
  oldestAt: string | null;
};

const TIMELINE_PAGE = 60;

/**
 * One conversation's timeline, newest page first.
 *
 * Paged at the database, and scoped to the business number, so a donor with thousands of messages
 * loads a page rather than an arbitrary 500-row window of the whole archive.
 */
export async function getConversation(
  idOrPhone: string,
  opts: { limit?: number; before?: string | Date | null } = {},
): Promise<ConversationDetail | null> {
  if (!process.env.DATABASE_URL) return null;
  const { senderId, phone } = parseConversationId(idOrPhone);
  const variants = phoneMatchVariants(phone);
  if (!variants.length) return null;
  const limit = Math.min(Math.max(opts.limit ?? TIMELINE_PAGE, 1), 200);
  const before = opts.before ? new Date(opts.before) : null;
  const senderScope = senderId ? { senderId } : {};

  const [events, deliveries, donorMap, senders] = await Promise.all([
    prisma.communicationProviderEvent
      .findMany({
        where: { channel: "WHATSAPP", recipient: { in: variants }, ...senderScope, ...(before ? { receivedAt: { lt: before } } : {}) },
        orderBy: { receivedAt: "desc" },
        take: limit + 1,
        select: { eventType: true, receivedAt: true, status: true, payloadSanitized: true, senderId: true },
      })
      .catch(() => []),
    prisma.communicationDelivery
      .findMany({
        where: { channel: "WHATSAPP", recipientPhone: { in: variants }, ...senderScope, ...(before ? { createdAt: { lt: before } } : {}) },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        select: { createdAt: true, renderedBody: true, variables: true, status: true, senderId: true },
      })
      .catch(() => []),
    matchDonors([phoneDigits(phone)]),
    senderMap(),
  ]);

  /* One page more than asked for from each side tells us whether older messages exist without a
     second count query. */
  const hasMore = events.length > limit || deliveries.length > limit;

  const timeline: TimelineItem[] = [];
  for (const delivery of deliveries.slice(0, limit)) {
    const vars = delivery.variables && typeof delivery.variables === "object"
      ? (delivery.variables as Record<string, unknown>)
      : null;
    const preview = vars?.whatsappPreview && typeof vars.whatsappPreview === "object"
      ? (vars.whatsappPreview as WhatsappRenderedPreview)
      : null;
    timeline.push({
      kind: "outbound",
      at: delivery.createdAt?.toISOString() ?? null,
      text: preview?.body ?? delivery.renderedBody ?? null,
      status: delivery.status,
      whatsappPreview: preview,
    });
  }
  let resolvedSenderId: string | null = senderId;
  for (const event of events.slice(0, limit)) {
    if (event.eventType === "inbound_message") {
      const payload = event.payloadSanitized as { text?: unknown; media?: unknown } | null;
      timeline.push({
        kind: "inbound",
        at: event.receivedAt?.toISOString() ?? null,
        text: payload && typeof payload.text === "string" ? payload.text : null,
        status: null,
        media: (payload?.media ?? null) as TimelineItem["media"],
      });
    } else {
      timeline.push({ kind: "status", at: event.receivedAt?.toISOString() ?? null, text: null, status: event.status ?? event.eventType });
    }
    if (!resolvedSenderId && event.senderId) resolvedSenderId = event.senderId;
  }
  if (!resolvedSenderId) {
    for (const delivery of deliveries) if (delivery.senderId) { resolvedSenderId = delivery.senderId; break; }
  }
  timeline.sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));

  const matches = donorMap.get(phoneDigits(phone)) ?? [];
  return {
    id: conversationId(resolvedSenderId, phone),
    phone: normalizePhoneE164(phone) ?? phone,
    donor: matches.length === 1 ? matches[0] : null,
    unresolved: matches.length !== 1,
    timeline,
    sender: resolvedSenderId ? senders.get(resolvedSenderId) ?? null : null,
    hasMore,
    oldestAt: timeline.length ? timeline[0].at : null,
  };
}

/** Latest handled-marker time, keyed by whatever the marker was written against. */
async function loadHandledMarkers(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!process.env.DATABASE_URL) return map;
  try {
    const rows = await prisma.auditLog.findMany({
      where: { entityType: "CommunicationConversation", action: HANDLED_ACTION },
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: { entityId: true, createdAt: true },
    });
    for (const row of rows) {
      const key = row.entityId ?? "";
      if (key && !map.has(key)) map.set(key, row.createdAt?.getTime() ?? 0); // desc → first seen is latest
    }
  } catch (error) {
    console.error("loadHandledMarkers failed", error);
  }
  return map;
}

/** Mark a conversation handled (audit-backed; a new inbound reply re-opens it automatically). */
export async function markConversationHandled(idOrPhone: string, actor?: Actor): Promise<{ ok: boolean }> {
  const { senderId, phone } = parseConversationId(idOrPhone);
  const id = conversationId(senderId, phone);
  await writeAuditLog({
    actorId: actor?.actorId ?? undefined,
    actorName: actor?.actorName ?? undefined,
    actorRole: actor?.actorRole ?? "ADMIN",
    action: HANDLED_ACTION,
    messageAr: `تم التعامل مع محادثة واتساب`,
    messageEn: `WhatsApp conversation marked handled`,
    entityType: "CommunicationConversation",
    entityId: id,
    metadata: { conversationId: id, phone, senderId, externalCall: false },
    stream: "TEAM",
  });
  return { ok: true };
}

/** Record a follow-up or link request against a conversation (audit-backed, no DB attach faked). */
export async function logConversationAction(idOrPhone: string, action: "followup" | "link", actor?: Actor): Promise<{ ok: boolean }> {
  const { senderId, phone } = parseConversationId(idOrPhone);
  const id = conversationId(senderId, phone);
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
    entityId: id,
    metadata: { conversationId: id, phone, senderId, externalCall: false },
    stream: "TEAM",
  });
  return { ok: true };
}
