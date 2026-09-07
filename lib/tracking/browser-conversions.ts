"use client";

export type PublicTrackingConfig = {
  googleAdsConversionId?: string | null;
  googleAdsConversionLabel?: string | null;
  tiktokPixelId?: string | null;
  xPixelId?: string | null;
};

export type BrowserDonationPayload = {
  eventId: string;
  transactionId: string;
  value: number;
  currency: string;
  contentIds?: string[];
  contentName?: string;
  contents?: Array<{ id: string; quantity?: number; item_price?: number }>;
  numItems?: number;
};

type TrackingWindow = Window & {
  gtag?: (...args: unknown[]) => void;
  ttq?: { track?: (event: string, payload?: Record<string, unknown>) => void };
  twq?: (action: string, ...args: unknown[]) => void;
};

async function logBrowser(donationId: string, body: Record<string, unknown>) {
  try {
    await fetch(`/api/donations/${encodeURIComponent(donationId)}/track-browser-conversion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify(body),
    });
  } catch {}
}

export async function fireGoogleAdsDonationConversion(config: PublicTrackingConfig, payload: BrowserDonationPayload) {
  if (typeof window === "undefined") return false;
  const w = window as TrackingWindow;
  if (!config.googleAdsConversionId || !config.googleAdsConversionLabel || !w.gtag) return false;
  w.gtag("event", "conversion", {
    send_to: `${config.googleAdsConversionId}/${config.googleAdsConversionLabel}`,
    value: payload.value,
    currency: payload.currency,
    transaction_id: payload.transactionId,
    event_id: payload.eventId,
  });
  await logBrowser(payload.transactionId, { platform: "GOOGLE_ADS", eventName: "conversion", eventId: payload.eventId, value: payload.value, currency: payload.currency, status: "SENT" });
  return true;
}

export async function fireTikTokDonationConversion(config: PublicTrackingConfig, payload: BrowserDonationPayload) {
  if (typeof window === "undefined") return false;
  const w = window as TrackingWindow;
  if (!config.tiktokPixelId || !w.ttq?.track) return false;
  w.ttq.track("CompletePayment", {
    value: payload.value,
    currency: payload.currency,
    content_id: payload.contentIds?.[0] ?? "donation",
    content_name: payload.contentName ?? "Donation",
    content_type: "product",
    contents: payload.contents,
    event_id: payload.eventId,
  });
  await logBrowser(payload.transactionId, { platform: "TIKTOK", eventName: "CompletePayment", eventId: payload.eventId, value: payload.value, currency: payload.currency, status: "SENT" });
  return true;
}

export async function fireXDonationConversion(config: PublicTrackingConfig, payload: BrowserDonationPayload) {
  if (typeof window === "undefined") return false;
  const w = window as TrackingWindow;
  if (!config.xPixelId || !w.twq) return false;
  w.twq("event", config.xPixelId, {
    value: payload.value,
    currency: payload.currency,
    conversion_id: payload.eventId,
    tw_sale_amount: payload.value,
    tw_order_quantity: payload.numItems ?? payload.contents?.length ?? 1,
  });
  await logBrowser(payload.transactionId, { platform: "X", eventName: "Purchase", eventId: payload.eventId, value: payload.value, currency: payload.currency, status: "SENT" });
  return true;
}
