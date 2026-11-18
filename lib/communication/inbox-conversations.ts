import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { classifyInboxLanguage, isInboxLanguage, type InboxLanguage, type LanguageSource } from "./inbox-language";

/**
 * The inbox's conversation layer (owner, 2026-11-18). One row per conversation on the site's single
 * WhatsApp number, kept current as messages arrive and replies leave, so the list, the language tabs,
 * assignment and unread counts never have to be rebuilt from the whole message archive.
 * Message bodies stay where they are (provider events and deliveries); this holds only the summary.
 */
const COLLECTION = "InboxConversation";
const DAY = 86_400_000;
const raw = (cmd: Record<string, unknown>) => prisma.$runCommandRaw(cmd as Prisma.InputJsonObject);
const rows = (r: unknown) => ((r as { cursor?: { firstBatch?: Record<string, unknown>[] } })?.cursor?.firstBatch ?? []);
const preview = (text: string | null | undefined) => String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 140);

export type InboxConversation = {
  id: string; senderId: string; phone: string; name: string | null; donorUserId: string | null;
  language: InboxLanguage; languageSource: LanguageSource;
  assigneeId: string | null; assigneeName: string | null; status: "OPEN" | "DONE";
  unreadCount: number; lastInboundAt: string | null; lastOutboundAt: string | null; lastMessageAt: string | null;
  lastPreview: string; lastDirection: "in" | "out" | null; windowExpiresAt: string | null;
};
const toConversation = (d: Record<string, unknown>): InboxConversation => {
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === "string" ? v : null);
  return {
    id: String(d._id), senderId: String(d.senderId ?? ""), phone: String(d.phone ?? ""), name: typeof d.name === "string" ? d.name : null,
    donorUserId: typeof d.donorUserId === "string" ? d.donorUserId : null,
    language: isInboxLanguage(d.language) ? d.language : "en", languageSource: (d.languageSource as LanguageSource) ?? "default",
    assigneeId: typeof d.assigneeId === "string" ? d.assigneeId : null, assigneeName: typeof d.assigneeName === "string" ? d.assigneeName : null,
    status: d.status === "DONE" ? "DONE" : "OPEN", unreadCount: typeof d.unreadCount === "number" ? d.unreadCount : 0,
    lastInboundAt: iso(d.lastInboundAt), lastOutboundAt: iso(d.lastOutboundAt), lastMessageAt: iso(d.lastMessageAt),
    lastPreview: String(d.lastPreview ?? ""), lastDirection: d.lastDirection === "in" || d.lastDirection === "out" ? d.lastDirection : null,
    windowExpiresAt: iso(d.windowExpiresAt),
  };
};

/** The site's one WhatsApp number (the default sender). Cached for a minute. */
let defaultSender: { until: number; id: string | null } | null = null;
export async function inboxSenderId(): Promise<string | null> {
  if (defaultSender && defaultSender.until > Date.now()) return defaultSender.id;
  const s = await prisma.communicationSender.findFirst({ where: { channel: "WHATSAPP", isDefault: true, enabled: true }, select: { id: true } });
  defaultSender = { until: Date.now() + 60_000, id: s?.id ?? null };
  return defaultSender.id;
}

/** The donor behind a phone number: their site language, name and account (best effort). */
async function donorForPhone(phone: string): Promise<{ locale: string | null; name: string | null; userId: string | null }> {
  const digits = phone.replace(/\D/g, "");
  const variants = [phone, "+" + digits, digits];
  const profile = await prisma.donorCommunicationProfile.findFirst({ where: { phone: { in: variants } }, select: { preferredLocale: true, userId: true } }).catch(() => null);
  if (!profile?.userId) return { locale: profile?.preferredLocale ?? null, name: null, userId: null };
  const user = await prisma.user.findUnique({ where: { id: profile.userId }, select: { name: true } }).catch(() => null);
  return { locale: profile.preferredLocale ?? null, name: user?.name ?? null, userId: profile.userId };
}

/** A message arrived. Creates the conversation (with its language) or moves it to the top as unread. */
export async function touchInbound(input: { senderId: string | null; phone: string; text: string | null; profileName?: string | null; at: Date }): Promise<void> {
  const sid = await inboxSenderId();
  if (!sid || input.senderId !== sid || !input.phone) return; // only the site's own number
  const id = `${sid}:${input.phone}`;
  const existing = rows(await raw({ find: COLLECTION, filter: { _id: id }, limit: 1 }))[0];
  const donor = existing ? null : await donorForPhone(input.phone);
  const lang = existing ? null : classifyInboxLanguage({ profileLocale: donor?.locale, text: input.text, phone: input.phone });
  await raw({ update: COLLECTION, updates: [{ q: { _id: id }, upsert: true, u: {
    $setOnInsert: { senderId: sid, phone: input.phone, donorUserId: donor?.userId ?? null, language: lang?.language ?? "en", languageSource: lang?.source ?? "default",
      assigneeId: null, assigneeName: null, lastOutboundAt: null, createdAt: input.at },
    $set: { lastMessageAt: input.at, lastInboundAt: input.at, lastPreview: preview(input.text), lastDirection: "in", windowExpiresAt: new Date(input.at.getTime() + DAY), status: "OPEN", updatedAt: new Date(),
      ...(donor?.name || input.profileName ? { name: donor?.name || input.profileName } : {}) },
    $inc: { unreadCount: 1 },
  } }] });
}

/** A reply left from the dashboard: the conversation is answered (read) and shows the reply. */
export async function touchOutbound(input: { senderId: string | null; phone: string; text: string | null; at: Date }): Promise<void> {
  const sid = await inboxSenderId();
  if (!sid || input.senderId !== sid) return;
  await raw({ update: COLLECTION, updates: [{ q: { _id: `${sid}:${input.phone}` }, u: { $set: { lastMessageAt: input.at, lastOutboundAt: input.at, lastPreview: preview(input.text), lastDirection: "out", unreadCount: 0, updatedAt: new Date() } } }] });
}

export type InboxFilter = { language?: InboxLanguage | "all"; view?: "all" | "mine" | "unread" | "done"; userId?: string | null; q?: string; limit?: number; before?: string | null };
export async function listInboxConversations(f: InboxFilter): Promise<InboxConversation[]> {
  const sid = await inboxSenderId();
  if (!sid) return [];
  const filter: Record<string, unknown> = { senderId: sid, status: f.view === "done" ? "DONE" : "OPEN" };
  if (f.language && f.language !== "all") filter.language = f.language;
  if (f.view === "mine") filter.assigneeId = f.userId ?? "__none__";
  if (f.view === "unread") filter.unreadCount = { $gt: 0 };
  const q = (f.q ?? "").trim();
  if (q) { const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 60); filter.$or = [{ name: { $regex: safe, $options: "i" } }, { phone: { $regex: safe.replace(/\D/g, "") || safe } }, { lastPreview: { $regex: safe, $options: "i" } }]; }
  if (f.before) filter.lastMessageAt = { $lt: new Date(f.before) };
  return rows(await raw({ find: COLLECTION, filter, sort: { lastMessageAt: -1 }, limit: Math.min(Math.max(f.limit ?? 50, 1), 100) })).map(toConversation);
}

/** Unread conversations per tab, and those assigned to this user — for the tabs and the alert badges. */
export async function inboxCounts(userId: string | null): Promise<Record<InboxLanguage | "all" | "mine", number>> {
  const sid = await inboxSenderId();
  const out = { ar: 0, tr: 0, fr: 0, en: 0, all: 0, mine: 0 };
  if (!sid) return out;
  const res = await raw({ aggregate: COLLECTION, pipeline: [{ $match: { senderId: sid, status: "OPEN", unreadCount: { $gt: 0 } } }, { $group: { _id: "$language", n: { $sum: 1 }, mine: { $sum: { $cond: [{ $eq: ["$assigneeId", userId] }, 1, 0] } } } }], cursor: {} });
  for (const r of rows(res)) { const l = String(r._id); if (isInboxLanguage(l)) out[l] = Number(r.n); out.all += Number(r.n); out.mine += Number(r.mine); }
  return out;
}

const ID = /^[a-f\d]{24}:\+?\d{6,16}$/;
export async function updateInboxConversation(id: string, patch: { assigneeId?: string | null; assigneeName?: string | null; language?: unknown; read?: boolean; status?: unknown }): Promise<void> {
  if (!ID.test(id)) throw new Error("INVALID_ID");
  const $set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.assigneeId !== undefined) { $set.assigneeId = patch.assigneeId; $set.assigneeName = patch.assigneeId ? patch.assigneeName ?? null : null; }
  if (patch.language !== undefined) { if (!isInboxLanguage(patch.language)) throw new Error("INVALID_LANGUAGE"); $set.language = patch.language; $set.languageSource = "manual"; }
  if (patch.read === true) $set.unreadCount = 0;
  if (patch.status !== undefined) { if (patch.status !== "OPEN" && patch.status !== "DONE") throw new Error("INVALID_STATUS"); $set.status = patch.status; }
  await raw({ update: COLLECTION, updates: [{ q: { _id: id }, u: { $set } }] });
}
