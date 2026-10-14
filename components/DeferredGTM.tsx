"use client";

import { useEffect } from "react";
import { whenMarketingAllowed } from "@/lib/tracking/marketing-gate";

const GTM_ID = "GTM-MMNBQQWB";
const CONVERSION_PATH_RE = /\/(success|donation-failed)(\/|$)/;

function isConversionPage(): boolean {
  return typeof window !== "undefined" && CONVERSION_PATH_RE.test(window.location.pathname);
}

function loadGtm() {
  const w = window as Window & { __gtmLoaded?: boolean; dataLayer?: unknown[] };
  if (w.__gtmLoaded) return;
  w.__gtmLoaded = true;

  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
  document.head.appendChild(script);
}

/**
 * Google Tag Manager, loaded when the marketing gate opens
 * (`lib/tracking/marketing-gate.ts`): the visitor's first interaction, or
 * shortly after the page has loaded. The container's tags (GA4, Ads, Meta,
 * TikTok) are ~1 MB and ~1–2 s of script; loaded during the first paint they
 * were most of the homepage's Total Blocking Time.
 */
export default function DeferredGTM() {
  useEffect(() => {
    // Conversion pages must not wait. The donation success page queues
    // `donation_paid` in dataLayer and GTM needs to be available quickly for
    // Meta / Ads conversion tags, especially when donors close the tab fast.
    if (isConversionPage()) {
      loadGtm();
      return;
    }
    return whenMarketingAllowed(loadGtm);
  }, []);

  return null;
}
