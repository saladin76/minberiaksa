"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  fireGoogleAdsDonationConversion,
  fireTikTokDonationConversion,
  fireXDonationConversion,
  type PublicTrackingConfig,
} from "@/lib/tracking/browser-conversions";

type DonateTrackingPayload = {
  ok: true;
  eventId: string;
  metaEvents?: Array<{ eventName: "Donate" | "Purchase"; eventId: string }>;
  transactionId: string;
  value: number;
  currency: string;
  contentIds?: string[];
  contentName?: string;
  contentCategory?: string;
  contents?: Array<{ id: string; quantity: number; item_price: number }>;
  numItems?: number;
  donationType?: "ONE_TIME" | "DAILY" | "FRIDAY" | "MONTHLY";
  paymentMethod?: string;
};

/* `Window.fbq` is declared once, in `components/TrackingPixels.tsx`, which is where the pixel is
   installed. Re-declaring it here with a narrower signature was a conflicting global augmentation:
   two `declare global` blocks for the same property must agree, and these did not. The calls below
   satisfy the variadic declaration unchanged. */

const MAX_ATTEMPTS = 20;
const RETRY_MS = 750;
const META_BROWSER_MAX_ATTEMPTS = 60;
const META_BROWSER_RETRY_MS = 150;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function donationIdFromPath(pathname: string | null) {
  if (!pathname) return null;
  const parts = pathname.split("/").filter(Boolean);
  const index = parts.indexOf("success");
  return index >= 0 ? parts[index + 1] ?? null : null;
}

async function logMetaBrowser(payload: DonateTrackingPayload, status: "SENT" | "FAILED" | "SKIPPED", eventName: "Donate" | "Purchase", eventId: string, error?: string) {
  try {
    const token = new URLSearchParams(window.location.search).get("t");
    await fetch(`/api/donations/${encodeURIComponent(payload.transactionId)}/track-browser-conversion${token ? `?t=${encodeURIComponent(token)}` : ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        platform: "META",
        eventName,
        eventId,
        value: payload.value,
        currency: payload.currency,
        status,
        error,
      }),
    });
  } catch {}
}

function fireMetaBrowserDonate(payload: DonateTrackingPayload, eventName: "Donate" | "Purchase", eventId: string): { ok: boolean; error?: string } {
  if (typeof window === "undefined") return { ok: false, error: "window unavailable" };
  if (typeof window.fbq !== "function") return { ok: false, error: "fbq unavailable" };
  try {
    window.fbq("track", eventName, {
      value: payload.value,
      currency: payload.currency,
      content_type: eventName === "Purchase" ? "product" : "donation",
      content_name: payload.contentName,
      content_category: payload.contentCategory ?? (payload.donationType && payload.donationType !== "ONE_TIME" ? payload.donationType.toLowerCase() : "donation"),
      content_ids: payload.contentIds,
      contents: payload.contents,
      num_items: payload.numItems,
      order_id: payload.transactionId,
      transaction_id: payload.transactionId,
      status: "paid",
      success: true,
      payment_info_available: true,
      donation_type: (payload.donationType ?? "ONE_TIME").toLowerCase(),
      recurring: !!payload.donationType && payload.donationType !== "ONE_TIME",
      payment_method: (payload.paymentMethod ?? "card").toLowerCase(),
    }, { eventID: eventId });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "fbq failed" };
  }
}

async function waitAndFireMetaBrowserDonate(payload: DonateTrackingPayload, eventName: "Donate" | "Purchase", eventId: string, isCancelled: () => boolean) {
  let lastError = "fbq unavailable";
  for (let attempt = 1; attempt <= META_BROWSER_MAX_ATTEMPTS; attempt += 1) {
    if (isCancelled()) return { ok: false, error: "cancelled" };
    const result = fireMetaBrowserDonate(payload, eventName, eventId);
    if (result.ok) return result;
    lastError = result.error || lastError;
    if (attempt < META_BROWSER_MAX_ATTEMPTS) await sleep(META_BROWSER_RETRY_MS);
  }
  return { ok: false, error: lastError };
}

function markMetaBrowserDone(payload: DonateTrackingPayload, eventName: "Donate" | "Purchase", eventId: string) {
  try { window.localStorage.setItem(`marketing_final_browser:${eventId}`, "1"); } catch {}
  if (eventName !== "Donate") return;
  try { window.localStorage.setItem(`donate_fired:${payload.transactionId}`, "1"); } catch {}
  try { window.sessionStorage.setItem(`meta_donate_${payload.eventId}`, "1"); } catch {}
}

function markMetaBrowserAttempting(payload: DonateTrackingPayload) {
  try { window.sessionStorage.setItem(`marketing_final_browser_attempting:${payload.eventId}`, "1"); } catch {}
}

function clearMetaBrowserAttempting(payload: DonateTrackingPayload) {
  try { window.sessionStorage.removeItem(`marketing_final_browser_attempting:${payload.eventId}`); } catch {}
}

export function SuccessFinalConversionTracker() {
  const pathname = usePathname();
  const activeRef = useRef<string | null>(null);

  useEffect(() => {
    const id = donationIdFromPath(pathname);
    if (!id || typeof window === "undefined") return;
    if (activeRef.current === id) return;
    activeRef.current = id;

    let cancelled = false;
    (async () => {
      let payload: DonateTrackingPayload | null = null;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        if (cancelled) return;
        try {
          /* The guest's access token rides on the success URL (`?t=`); the
             tracking route reads it under the same rule as the receipt. */
          const token = new URLSearchParams(window.location.search).get("t");
          const res = await fetch(
            `/api/donations/${encodeURIComponent(id)}/tracking${token ? `?t=${encodeURIComponent(token)}` : ""}`,
            { cache: "no-store" }
          );
          const data = await res.json().catch(() => null);
          if (data?.ok === true) {
            payload = data;
            break;
          }
        } catch {
          return;
        }
        if (attempt < MAX_ATTEMPTS) await sleep(RETRY_MS);
      }
      if (cancelled || !payload) return;

      const config = await fetch("/api/tracking/config", { cache: "no-store" }).then(res => res.json()).catch(() => ({})) as PublicTrackingConfig;
      // Each Meta event has its own guard: a prior Donate never suppresses Purchase.
      for (const event of payload.metaEvents ?? [{ eventName: "Donate" as const, eventId: payload.eventId }]) {
        if (cancelled) return;
        const eventPayload = { ...payload, eventId: event.eventId };
        try {
          if (window.localStorage.getItem(`marketing_final_browser:${event.eventId}`)) continue;
          if (window.sessionStorage.getItem(`marketing_final_browser_attempting:${event.eventId}`)) continue;
        } catch {}
        markMetaBrowserAttempting(eventPayload);
        try {
          const result = await waitAndFireMetaBrowserDonate(payload, event.eventName, event.eventId, () => cancelled);
          if (cancelled) return;
          await logMetaBrowser(payload, result.ok ? "SENT" : "SKIPPED", event.eventName, event.eventId, result.error);
          if (result.ok) markMetaBrowserDone(payload, event.eventName, event.eventId);
        } finally { clearMetaBrowserAttempting(eventPayload); }
      }
      const otherKey = `marketing_final_other:${payload.eventId}`;
      let otherDone = false;
      try { otherDone = !!window.localStorage.getItem(otherKey); } catch {}
      if (!otherDone) {
        await Promise.allSettled([
          fireGoogleAdsDonationConversion(config, payload),
          fireTikTokDonationConversion(config, payload),
          fireXDonationConversion(config, payload),
        ]);
        try { window.localStorage.setItem(otherKey, "1"); } catch {}
      }
    })();

    return () => { cancelled = true; activeRef.current = null; };
  }, [pathname]);

  return null;
}
