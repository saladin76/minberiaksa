/**
 * A gift on an order line: the donation is given in someone else's name, and
 * that person is told once the payment settles (`lib/donations/gift-delivery.ts`).
 *
 * Pure validation shared by the order API and its tests. The browser sends
 * whatever the panel collected; only what passes here is stored.
 */

export const GIFT_CHANNELS = ["EMAIL", "WHATSAPP"] as const;
export type GiftChannel = (typeof GIFT_CHANNELS)[number];

export interface GiftOrderInput {
  recipientName: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  message: string | null;
  channels: GiftChannel[];
  showAmount: boolean;
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
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
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

  return { ok: true, gift: { recipientName, recipientEmail, recipientPhone, message, channels, showAmount } };
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
