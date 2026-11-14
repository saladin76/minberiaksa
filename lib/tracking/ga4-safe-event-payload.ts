import type { CanonicalEvent } from "./canonical";

/**
 * GA4 custom ecommerce data must never contain names, email, phone,
 * birthdays, card fields, IP, authentication tokens or arbitrary custom text.
 *
 * Enhanced matching for Meta/TikTok is a separate, consent-gated pipeline.
 */
export function ga4SafeEventPayload(event: CanonicalEvent): Record<string, unknown> {
  const donation = event.donation ?? {};
  const payment = event.payment ?? {};
  const payload: Record<string, unknown> = {};

  const value = donation.amount ?? donation.amount_usd;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    payload.value = value;
  }
  if (typeof donation.currency === "string" && /^[A-Z]{3}$/.test(donation.currency)) {
    payload.currency = donation.currency;
  }
  if (typeof payment.transaction_id === "string" &&
      /^[a-zA-Z0-9_-]{1,100}$/.test(payment.transaction_id)) {
    payload.transaction_id = payment.transaction_id;
  }
  if (event.items?.length) {
    const items = event.items
      .filter(item => /^[a-zA-Z0-9_-]{1,120}$/.test(item.item_id))
      .slice(0, 100)
      .map(item => ({
        item_id: item.item_id,
        ...(typeof item.price === "number" && Number.isFinite(item.price) && item.price >= 0
          ? { price: item.price } : {}),
        ...(typeof item.quantity === "number" && Number.isFinite(item.quantity) &&
              item.quantity > 0 && item.quantity <= 10000
          ? { quantity: item.quantity } : {}),
      }));
    if (items.length) payload.items = items;
  }
  // Payment method is an enum; never send bank/card-holder details.
  if (typeof payment.method === "string" &&
      /^(CARD|card|PAYPAL|paypal|BANK_TRANSFER|bank)$/i.test(payment.method)) {
    payload.payment_type = payment.method.toLowerCase();
  }
  if (typeof payment.gateway === "string" &&
      /^(stripe|albaraka|payfor|paypal)$/i.test(payment.gateway)) {
    payload.payment_gateway = payment.gateway.toLowerCase();
  }
  if (donation.donation_type) payload.donation_type = donation.donation_type.toLowerCase();

  // Explicit, scalar, non-identifying engagement metrics only.
  const custom = event.custom ?? {};
  for (const key of ["engagement_time_msec", "percent_scrolled", "amount"]) {
    const value = custom[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1e9) {
      payload[key] = value;
    }
  }
  if (typeof custom.milestone === "string" && /^(5s|10s|15s|30s|60s)$/.test(custom.milestone)) {
    payload.milestone = custom.milestone;
  }
  return payload;
}
