/** "Gifted by" on a gifted waqf certificate (owner, 2026-11-18): ar/tr/en/fr, English for the rest. */
const GIFT_FROM: Record<string, string> = { ar: "مُهدى من", tr: "Hediye eden", en: "Gifted by", fr: "Offert par" };
export function giftFromLabel(locale: string): string {
  return GIFT_FROM[locale.slice(0, 2).toLowerCase()] ?? GIFT_FROM.en;
}

/**
 * How a waqf line appears on its certificate. A gifted line names the recipient as the endower,
 * credits the donor on a small "Gifted by" line, and hides only the value when asked (the count
 * of shares or metres stays).
 */
export function waqfGiftPresentation(item: { donorName: string; giftRecipientName?: string | null; giftShowAmount?: boolean | null }): { name: string; giftFrom?: string; hideTotal: boolean } {
  const recipient = item.giftRecipientName?.trim();
  if (!recipient) return { name: item.donorName, hideTotal: false };
  return { name: recipient, giftFrom: item.donorName, hideTotal: item.giftShowAmount === false };
}
