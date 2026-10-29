import { RECEIPT_BRANDS, receiptLocale } from "../templates/receipt-localization";

export const GIFT_WHATSAPP_TEMPLATE = "mia_gift_donation_v1";

/** Same six gift fields in every language; each provider variant is approved separately. */
export function giftTemplateBody(raw: unknown, locale = "ar"): string {
  const messages = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  if (typeof messages.whatsappBody !== "string" || !messages.whatsappBody || typeof messages.whatsappAmount !== "string" || !messages.whatsappAmount) throw new Error("GIFT_TRANSLATION_MISSING");
  const replace = (text: string) => text.replace(/\{(recipientName|donorName|project|amount)\}/g, (_, name: string) => `{{gift.${name}}}`);
  return [replace(messages.whatsappBody), replace(messages.whatsappAmount), "{{gift.message}}", "{{gift.certificateUrl}}", RECEIPT_BRANDS[receiptLocale(locale)]].join("\n\n");
}
