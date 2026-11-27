/**
 * The gift page's pure parts: intentions and card looks as designed, and the basket rows a finished
 * gift becomes — one row per recipient (each gets their own card, messages and certificate). Waqf
 * gifts are waqf rows (the waqf certificate in the recipient's name); impact and open gifts are
 * project rows. The server validates every row again (`parseGiftOrder`, waqf pricing).
 */
import { normalizeGiftPhone, parseGiftOrder, type GiftCard } from "../donations/gift-order";
import type { MinbarCartItem } from "./cart";

export const PAGE_OCCASIONS = [
  { id: "ramadan", tint: "#2B3A5C", theme: "night", icon: "M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z" },
  { id: "eid", tint: "#AB422F", theme: "dome", icon: "M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" },
  { id: "baby", tint: "#B35C5C", theme: "floral", icon: "M9 12h.01M15 12h.01M10 16c.6.4 1.3.6 2 .6s1.4-.2 2-.6M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z" },
  { id: "wedding", tint: "#A86A16", theme: "arabesque", icon: "M8 14a5 5 0 1 0 0-10M16 20a5 5 0 1 0 0-10M8 4a5 5 0 0 1 0 10M16 10a5 5 0 0 1 0 10" },
  { id: "recovery", tint: "#3F7A6B", theme: "floral", icon: "M12 21s-7-4.4-9.3-9C1.2 8.6 3.2 5 6.6 5c2 0 3.4 1.2 5.4 3.4C14 6.2 15.4 5 17.4 5c3.4 0 5.4 3.6 3.9 7-2.3 4.6-9.3 9-9.3 9z" },
  { id: "success", tint: "#1F6FB2", theme: "arabesque", icon: "M22 10L12 5 2 10l10 5 10-5zM6 12v5c3 2 9 2 12 0v-5" },
  { id: "hajj", tint: "#5E6B4E", theme: "dome", icon: "M4 20V9l8-5 8 5v11M9 20v-6h6v6" },
  { id: "memory", tint: "#4F5B4A", theme: "calm", icon: "M12 3c-2 3-5 4.5-5 8a5 5 0 0 0 10 0c0-3.5-3-5-5-8zM12 21v-5" },
  { id: "none", tint: "#7A2419", theme: "dome", icon: "M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7c-2-4-6-4-6-1s6 1 6 1zm0 0c2-4 6-4 6-1s-6 1-6 1z" },
] as const satisfies ReadonlyArray<{ id: GiftCard["occasion"]; tint: string; theme: GiftCard["theme"]; icon: string }>;

export const CARD_THEMES: Record<GiftCard["theme"], { bg: [string, string, string]; ink: string; accent: [string, string, string]; pattern: number; mark?: "dome" | "moon" | "leaves"; dark: boolean }> = {
  dome: { bg: ["radial-gradient(130% 120% at 85% 0%, #AB422F 0%, #7A2419 70%)", "radial-gradient(130% 120% at 85% 0%, #9B3B2C 0%, #5E1A12 70%)", "radial-gradient(130% 120% at 85% 0%, #B8563F 0%, #8E2A1E 70%)"], ink: "#FFF6EA", accent: ["#F6D08B", "#FFE3A8", "#F2C27A"], pattern: 0.12, mark: "dome", dark: true },
  night: { bg: ["radial-gradient(120% 120% at 20% 0%, #2B3A5C 0%, #141C30 75%)", "radial-gradient(120% 120% at 20% 0%, #24414A 0%, #0F1F24 75%)", "radial-gradient(120% 120% at 20% 0%, #3A2B5C 0%, #1A1330 75%)"], ink: "#F4EBDD", accent: ["#E9C77F", "#BFE0D6", "#E6C3F0"], pattern: 0.1, mark: "moon", dark: true },
  ivory: { bg: ["#FFFEFB", "#FBF7EE", "#F7F4EC"], ink: "#10212B", accent: ["#B8811C", "#A93428", "#2F5D50"], pattern: 0.16, mark: "dome", dark: false },
  arabesque: { bg: ["#FBF3E1", "#F4F0E6", "#FBEFE9"], ink: "#4A1A12", accent: ["#A86A16", "#3F5240", "#9B3B2C"], pattern: 0.35, dark: false },
  floral: { bg: ["#F8EDE8", "#EEF3EC", "#F3EEF6"], ink: "#3E2723", accent: ["#B35C5C", "#4F7A5A", "#7D5A9A"], pattern: 0.18, mark: "leaves", dark: false },
  calm: { bg: ["#EFE9DD", "#E9EEF0", "#F1ECE4"], ink: "#2F3B2F", accent: ["#5E6B4E", "#4C6470", "#7A6A4E"], pattern: 0.18, dark: false },
};

/** A remembrance gift keeps to quiet designs. */
export function themesFor(occasion: GiftCard["occasion"]): GiftCard["theme"][] {
  return occasion === "memory" ? ["calm", "ivory", "arabesque"] : ["dome", "night", "ivory", "arabesque", "floral", "calm"];
}

export const GIFT_ICON_PATHS: Record<string, string> = {
  water: "M12 2.7c-3 4-6 7-6 11a6 6 0 0 0 12 0c0-4-3-7-6-11z",
  meal: "M3 11h18M5 11a7 7 0 0 1 14 0M4 15h16l-2 5H6z",
  basket: "M5 9h14l-1.5 10h-11zM9 9l3-5 3 5",
  book: "M4 5c3-1 5-1 8 1 3-2 5-2 8-1v14c-3-1-5-1-8 1-3-2-5-2-8-1zM12 6v14",
  waqf: "M3 21h18M5 21V10l7-6 7 6v11M10 21v-6h4v6",
  meter: "M4 20h16M4 20V8l8-4 8 4v12M8 20v-5h8v5M9 10h6",
  gift: "M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7c-2-4-6-4-6-1s6 1 6 1zm0 0c2-4 6-4 6-1s-6 1-6 1z",
  heart: "M12 21s-7-4.4-9.3-9C1.2 8.6 3.2 5 6.6 5c2 0 3.4 1.2 5.4 3.4C14 6.2 15.4 5 17.4 5c3.4 0 5.4 3.6 3.9 7-2.3 4.6-9.3 9-9.3 9z",
  orphan: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21a7 7 0 0 1 14 0",
  open: "M12 5v14M5 12h14",
};

/** How many waqf units a value buys: the nearest whole number, at least one. */
export function waqfUnitsFor(valueUSD: number, unitPriceUSD: number, max: number): number {
  if (!(valueUSD > 0) || !(unitPriceUSD > 0)) return 1;
  return Math.min(Math.max(1, Math.round(valueUSD / unitPriceUSD)), Math.max(1, max));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export type GiftRecipientDraft = { name: string; phone: string; email: string };
export type GiftChoice =
  | { kind: "waqf"; unit: "share" | "meter"; count: number; unitPriceUSD: number; title: string }
  | { kind: "project"; slug: string; title: string; valueUSD: number };
export type GiftPageDraft = {
  choice: GiftChoice;
  recipients: GiftRecipientDraft[];
  message: string;
  showAmount: boolean;
  card: GiftCard;
  /** Printed as the endower on a waqf certificate (the signature, or the anonymous name). */
  giverName: string;
  whatsapp: boolean;
  email: boolean;
  /** null = as soon as the payment is confirmed. */
  sendAt: Date | null;
};
export type GiftDraftProblem = { code: "amount" | "name" | "channel" | "phone" | "email" | "date"; recipient?: string };

export function namedRecipients(list: GiftRecipientDraft[]): GiftRecipientDraft[] {
  return list.map(r => ({ name: r.name.trim(), phone: r.phone.trim(), email: r.email.trim() })).filter(r => r.name);
}

export function giftValueUSD(choice: GiftChoice): number {
  return choice.kind === "waqf" ? choice.count * choice.unitPriceUSD : choice.valueUSD;
}

/** The first thing wrong with the draft, in the order the donor fills it; null when it can be paid. */
export function giftDraftProblem(draft: GiftPageDraft, now: Date = new Date()): GiftDraftProblem | null {
  if (!(giftValueUSD(draft.choice) >= 1) || (draft.choice.kind === "project" && !draft.choice.slug)) return { code: "amount" };
  const people = namedRecipients(draft.recipients);
  if (!people.length) return { code: "name" };
  if (!draft.whatsapp && !draft.email) return { code: "channel" };
  for (const r of people) {
    if (draft.whatsapp && !normalizeGiftPhone(r.phone)) return { code: "phone", recipient: r.name };
    if (draft.email && !EMAIL_RE.test(r.email)) return { code: "email", recipient: r.name };
  }
  if (draft.sendAt) {
    const at = draft.sendAt.getTime();
    if (!Number.isFinite(at) || at < now.getTime() + 5 * 60_000 || at > now.getTime() + 365 * 86_400_000) return { code: "date" };
  }
  return null;
}

/** One basket row per recipient; each passes the same gift check the order API runs. */
export function giftCartItems(draft: GiftPageDraft): MinbarCartItem[] {
  return namedRecipients(draft.recipients).map(r => {
    const channels = [...(draft.whatsapp ? ["whatsapp" as const] : []), ...(draft.email ? ["email" as const] : [])];
    const gift = {
      recipientName: r.name.slice(0, 120),
      recipientPhone: draft.whatsapp ? r.phone : "",
      recipientEmail: draft.email ? r.email : "",
      message: draft.message.trim().slice(0, 600),
      channels,
      showAmount: draft.showAmount,
      card: { ...draft.card, signature: draft.card.anonymous ? null : (draft.card.signature?.trim().slice(0, 60) || null) },
      ...(draft.sendAt ? { sendAt: draft.sendAt.toISOString() } : {}),
    };
    const check = parseGiftOrder({ ...gift, channels: channels.map(c => c.toUpperCase()), recipientPhone: gift.recipientPhone || null, recipientEmail: gift.recipientEmail || null });
    if (!check.ok) throw new Error(check.error);
    const c = draft.choice;
    if (c.kind === "waqf") {
      return {
        typeKey: "waqf" as const, titleKey: c.unit === "meter" ? "unitMeter" : "unitShare", title: `${c.title} × ${c.count} — ${r.name.slice(0, 120)}`,
        freqKey: "once" as const, amount: c.count * c.unitPriceUSD, currency: "USD",
        waqf: { unit: c.unit, count: c.count, donorName: draft.giverName.trim().slice(0, 120) || r.name.slice(0, 120), onBehalf: r.name.slice(0, 120) },
        gift,
      };
    }
    return { projectId: c.slug, title: c.title, typeKey: "project" as const, freqKey: "once" as const, amount: Math.round(c.valueUSD * 100) / 100, currency: "USD", gift };
  });
}
