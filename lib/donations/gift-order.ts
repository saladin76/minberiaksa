/**
 * A gift on an order line: the donation is given in someone else's name, and
 * that person is told once the payment settles (`lib/donations/gift-delivery.ts`).
 *
 * Pure validation shared by the order API and its tests. The browser sends
 * whatever the panel collected; only what passes here is stored.
 */

export const GIFT_CHANNELS = ["EMAIL", "WHATSAPP"] as const;
export const GIFT_OCCASIONS = ["ramadan", "eid", "baby", "wedding", "recovery", "success", "hajj", "memory", "none"] as const;
export const GIFT_THEMES = ["dome", "night", "arabesque", "floral", "calm"] as const;
/** The card designed on the gift page; validated here, stored on the line as `giftCard`. */
export interface GiftCard {
  occasion: (typeof GIFT_OCCASIONS)[number];
  theme: (typeof GIFT_THEMES)[number];
  accent: 0 | 1 | 2;
  font: "naskh" | "modern";
  signature: string | null;
  anonymous: boolean;
}
const SEND_AT_MAX_DAYS = 366;
export type GiftChannel = (typeof GIFT_CHANNELS)[number];

export interface GiftOrderInput {
  recipientName: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  message: string | null;
  channels: GiftChannel[];
  showAmount: boolean;
  /** Gift page only; null elsewhere. */
  card?: GiftCard | null;
  /** When to tell the recipient; null = once paid. */
  sendAt?: Date | null;
}

export type GiftParseResult =
  | { ok: true; gift: GiftOrderInput | null }
  | { ok: false; error: string };

const NAME_MAX = 120;
const MESSAGE_MAX = 600;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Digits only, with a leading `+`: what WhatsApp's API takes. */
export function normalizeGiftPhone(raw: string): string | null {
  const latin = raw.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x6f0));
  const digits = latin.replace(/[^\d]/g, "").replace(/^00/, "");
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return `+${digits}`;
}

/**
 * `undefined`/`null` is an ordinary line (`{ ok: true, gift: null }`). Anything
 * else must name the recipient and, for each chosen channel, carry the address
 * that channel needs. A gift with no channel is allowed: the certificate is
 * still issued in the recipient's name, and the donor passes it on themselves.
 */
export function parseGiftOrder(raw: unknown): GiftParseResult {
  if (raw == null) return { ok: true, gift: null };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Invalid gift" };
  const o = raw as Record<string, unknown>;

  const recipientName = str(o.recipientName, NAME_MAX);
  if (!recipientName) return { ok: false, error: "A gift needs the recipient's name" };

  const channelsRaw = Array.isArray(o.channels) ? o.channels : [];
  const channels: GiftChannel[] = [];
  for (const c of channelsRaw) {
    const code = typeof c === "string" ? c.trim().toUpperCase() : "";
    if (!(GIFT_CHANNELS as readonly string[]).includes(code)) return { ok: false, error: "Unsupported gift channel" };
    if (!channels.includes(code as GiftChannel)) channels.push(code as GiftChannel);
  }

  const emailIn = str(o.recipientEmail, 200);
  const recipientEmail = emailIn ? emailIn.toLowerCase() : null;
  if (channels.includes("EMAIL") && !(recipientEmail && EMAIL_RE.test(recipientEmail))) {
    return { ok: false, error: "A gift sent by email needs the recipient's email address" };
  }
  if (recipientEmail && !EMAIL_RE.test(recipientEmail)) return { ok: false, error: "Invalid recipient email" };

  const phoneIn = str(o.recipientPhone, 40);
  const recipientPhone = phoneIn ? normalizeGiftPhone(phoneIn) : null;
  if (channels.includes("WHATSAPP") && !recipientPhone) {
    return { ok: false, error: "A gift sent on WhatsApp needs the recipient's phone number" };
  }
  if (phoneIn && !recipientPhone) return { ok: false, error: "Invalid recipient phone number" };

  const message = str(o.message, MESSAGE_MAX) || null;
  const showAmount = o.showAmount !== false;

  let card: GiftCard | null = null;
  if (o.card != null) {
    if (typeof o.card !== "object" || Array.isArray(o.card)) return { ok: false, error: "Invalid gift card" };
    const c = o.card as Record<string, unknown>;
    const occasion = (GIFT_OCCASIONS as readonly string[]).includes(String(c.occasion)) ? (c.occasion as GiftCard["occasion"]) : null;
    const theme = (GIFT_THEMES as readonly string[]).includes(String(c.theme)) ? (c.theme as GiftCard["theme"]) : null;
    const accent = c.accent === 0 || c.accent === 1 || c.accent === 2 ? c.accent : null;
    const font = c.font === "naskh" || c.font === "modern" ? c.font : null;
    if (!occasion || !theme || accent === null || !font) return { ok: false, error: "Invalid gift card" };
    card = { occasion, theme, accent, font, signature: str(c.signature, 60) || null, anonymous: c.anonymous === true };
  }

  let sendAt: Date | null = null;
  if (o.sendAt != null && o.sendAt !== "") {
    const at = new Date(String(o.sendAt)), now = Date.now();
    if (Number.isNaN(at.getTime()) || at.getTime() < now - 5 * 60_000 || at.getTime() > now + SEND_AT_MAX_DAYS * 86_400_000) return { ok: false, error: "Invalid gift delivery time" };
    sendAt = at;
  }

  return { ok: true, gift: { recipientName, recipientEmail, recipientPhone, message, channels, showAmount, ...(card ? { card } : {}), ...(sendAt ? { sendAt } : {}) } };
}

/** The gift page's card and delivery time, for campaign lines (DonationItem) only. */
export function giftCardData(gift: GiftOrderInput | null) {
  if (!gift || (!gift.card && !gift.sendAt)) return {};
  return { ...(gift.card ? { giftCard: gift.card as unknown as object } : {}), ...(gift.sendAt ? { giftSendAt: gift.sendAt } : {}) };
}

/** The Prisma column values for a parsed gift, spread into a line's `create`. */
export function giftLineData(gift: GiftOrderInput | null) {
  if (!gift) return {};
  return {
    giftRecipientName: gift.recipientName,
    giftRecipientEmail: gift.recipientEmail,
    giftRecipientPhone: gift.recipientPhone,
    giftMessage: gift.message,
    giftChannels: gift.channels,
    giftShowAmount: gift.showAmount,
  };
}
