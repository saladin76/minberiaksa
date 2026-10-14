"use client";

import { useEffect } from "react";

const GTM_ID = "GTM-MMNBQQWB";
/* Fallback for a visitor who neither scrolls, taps nor types: this long after
   `load`. Almost everyone triggers GTM sooner by interacting. The trade-off is
   explicit: a lower value records more of the visitors who leave untouched,
   and puts the container's ~3 s of tag script back into the window PageSpeed
   measures (Total Blocking Time). */
const IDLE_DELAY_MS = 15000;
const CONVERSION_PATH_RE = /\/(success|donation-failed)(\/|$)/;

function isConversionPage(): boolean {
  return typeof window !== "undefined" && CONVERSION_PATH_RE.test(window.location.pathname);
}

export default function DeferredGTM() {
  useEffect(() => {
    if ((window as Window & { __gtmLoaded?: boolean }).__gtmLoaded) return;

    let loaded = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      window.removeEventListener("load", startFallback);
      window.removeEventListener("wheel", loadGtm);
      window.removeEventListener("pointerdown", loadGtm);
      window.removeEventListener("keydown", loadGtm);
      window.removeEventListener("touchstart", loadGtm);
    };

    const loadGtm = () => {
      if (loaded) return;
      loaded = true;
      (window as Window & { __gtmLoaded?: boolean }).__gtmLoaded = true;

      const w = window as unknown as { dataLayer?: unknown[] };
      w.dataLayer = w.dataLayer || [];
      w.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
      document.head.appendChild(script);

      cleanup();
    };

    // Conversion pages must not wait for scroll/idle. The donation success page
    // queues `donation_paid` in dataLayer and GTM needs to be available quickly
    // for Meta / Ads conversion tags, especially when donors close the tab fast.
    if (isConversionPage()) {
      loadGtm();
      return cleanup;
    }

    // The fallback for a visitor who never scrolls or taps counts from the
    // page's `load`, not from mount. From mount it fired while a slow phone was
    // still loading the page, and the container's tags (GA4, Ads, Meta, TikTok:
    // ~1.2 MB, ~3 s of script) competed with the page's own first render.
    // A declaration, so `cleanup` (which can run first, from a conversion page) can name it.
    function startFallback() {
      timeoutId = setTimeout(loadGtm, IDLE_DELAY_MS);
    }
    if (document.readyState === "complete") startFallback();
    else window.addEventListener("load", startFallback, { once: true });
    // Not `scroll`: it also fires for scrolls the page makes itself (scroll
    // restoration, ScrollToTop), which loaded GTM ~3 s in with no visitor input.
    // A visitor scrolls with a wheel, a touch or a key, all listened for here.
    window.addEventListener("wheel", loadGtm, { passive: true, once: true });
    window.addEventListener("pointerdown", loadGtm, { once: true });
    window.addEventListener("keydown", loadGtm, { once: true });
    window.addEventListener("touchstart", loadGtm, { passive: true, once: true });

    return cleanup;
  }, []);

  return null;
}
