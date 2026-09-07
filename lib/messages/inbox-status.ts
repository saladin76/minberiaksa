/**
 * Inbox triage vocabulary.
 *
 * A contact message is in exactly one of three states, derived from two timestamps rather than
 * stored as a status column — a column would let `status: "REPLIED"` disagree with a null
 * `repliedAt`, and the timestamps are what the UI actually shows ("رد عليها منذ ساعتين").
 *
 *   unread   readAt = null                        — nobody has opened it
 *   pending  readAt set, repliedAt = null         — opened, still owes an answer
 *   replied  repliedAt set                        — answered (or marked answered by hand)
 *
 * This module is deliberately dependency-free so the API routes, the sidebar badge poller and
 * the client cards all agree on one definition instead of each re-deriving it.
 */

export const MESSAGE_REPLY_CHANNELS = ["EMAIL", "WHATSAPP", "MANUAL"] as const;
export type MessageReplyChannel = (typeof MESSAGE_REPLY_CHANNELS)[number];

export function isMessageReplyChannel(value: unknown): value is MessageReplyChannel {
  return typeof value === "string" && (MESSAGE_REPLY_CHANNELS as readonly string[]).includes(value);
}

export const INBOX_STATUSES = ["unread", "pending", "replied"] as const;
export type InboxStatus = (typeof INBOX_STATUSES)[number];

export function isInboxStatus(value: unknown): value is InboxStatus {
  return typeof value === "string" && (INBOX_STATUSES as readonly string[]).includes(value);
}

export type TriageTimestamps = {
  readAt?: string | Date | null;
  repliedAt?: string | Date | null;
};

export function inboxStatusOf(message: TriageTimestamps): InboxStatus {
  if (message.repliedAt) return "replied";
  if (message.readAt) return "pending";
  return "unread";
}

export const INBOX_STATUS_LABELS: Record<InboxStatus, string> = {
  unread: "جديدة",
  pending: "بانتظار الرد",
  replied: "تم الرد",
};

export const REPLY_CHANNEL_LABELS: Record<MessageReplyChannel, string> = {
  EMAIL: "بالبريد",
  WHATSAPP: "عبر واتساب",
  MANUAL: "يدويًا",
};

/* ------------------------------------------------------------------ *
 * Prisma / MongoDB filters
 * ------------------------------------------------------------------ */

/**
 * Every message written before this feature existed has these fields **absent**, not null.
 * On MongoDB, Prisma's `field: null` and `field: { isSet: false }` do not cover the same
 * documents, so "never read" has to be spelled as the union of both — otherwise the entire
 * existing inbox would count as already read and the badge would open at zero.
 *
 * The positive filters pair `isSet: true` with `not: null` for the same reason, so a message
 * with no `readAt` key can never be mistaken for one that has been opened.
 */
export const NOT_READ_WHERE = { OR: [{ readAt: null }, { readAt: { isSet: false } }] };
export const NOT_REPLIED_WHERE = { OR: [{ repliedAt: null }, { repliedAt: { isSet: false } }] };
export const IS_READ_WHERE = { readAt: { isSet: true, not: null } };
export const IS_REPLIED_WHERE = { repliedAt: { isSet: true, not: null } };

/** The `where` fragment that selects exactly one triage state. */
export function inboxStatusWhere(status: InboxStatus): Record<string, unknown> {
  if (status === "unread") return NOT_READ_WHERE;
  if (status === "replied") return IS_REPLIED_WHERE;
  return { AND: [IS_READ_WHERE, NOT_REPLIED_WHERE] };
}

/* ------------------------------------------------------------------ *
 * Ageing
 * ------------------------------------------------------------------ */

const HOUR = 60 * 60 * 1000;
/** Answer inside a working day, or the card starts asking for attention. */
export const REPLY_DUE_MS = 24 * HOUR;
export const REPLY_OVERDUE_MS = 72 * HOUR;

export type Urgency = "none" | "due" | "overdue";

/**
 * How loudly a card should ask to be answered. Answered messages never age — the clock is on
 * the *reply*, not on the message, so a three-year-old thread that was handled stays quiet.
 */
export function replyUrgency(
  message: TriageTimestamps & { createdAt: string | Date },
  now: number = Date.now(),
): Urgency {
  if (message.repliedAt) return "none";
  const waited = now - new Date(message.createdAt).getTime();
  if (waited >= REPLY_OVERDUE_MS) return "overdue";
  if (waited >= REPLY_DUE_MS) return "due";
  return "none";
}

/** "منذ ٣ أيام" for the waiting label, without the "ago" framing of relativeTime. */
export function waitedLabel(createdAt: string | Date, now: number = Date.now()): string {
  const waited = Math.max(0, now - new Date(createdAt).getTime());
  const days = Math.floor(waited / (24 * HOUR));
  if (days >= 1) return days === 1 ? "منذ يوم" : days === 2 ? "منذ يومين" : `منذ ${days} يومًا`;
  const hours = Math.floor(waited / HOUR);
  if (hours >= 1) return hours === 1 ? "منذ ساعة" : hours === 2 ? "منذ ساعتين" : `منذ ${hours} ساعات`;
  return "منذ قليل";
}

/* ------------------------------------------------------------------ *
 * Cross-component signal
 * ------------------------------------------------------------------ */

/**
 * The inbox page dispatches this on `window` whenever it changes a message's read state, so the
 * sidebar badge drops the moment a message is opened instead of lagging until the next 60s
 * poll. A DOM event rather than shared state because the two live in different React trees
 * (the shell renders the sidebar; the route renders the inbox).
 *
 * It carries a **delta**, not a total: the inbox's own unread count is scoped to whatever
 * filters are active, while the badge counts the whole inbox, so a total from one is a wrong
 * number for the other. `-1` is true regardless of what is being filtered.
 */
export const INBOX_UNREAD_EVENT = "gozbebekleri:inbox-unread";

export function emitInboxUnreadDelta(delta: number): void {
  if (typeof window === "undefined" || !delta) return;
  window.dispatchEvent(new CustomEvent(INBOX_UNREAD_EVENT, { detail: { delta } }));
}

/* ------------------------------------------------------------------ *
 * WhatsApp
 * ------------------------------------------------------------------ */

/**
 * wa.me takes bare digits — no "+", no spaces, no dashes. The number handed in here is already
 * E.164-normalised server-side (see `lib/messages/contact-phone.ts`); this only assembles the
 * URL so the card and the dialog cannot build it differently.
 */
export function whatsappUrl(e164Digits: string, text?: string): string {
  const digits = e164Digits.replace(/\D+/g, "");
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${digits}${query}`;
}
