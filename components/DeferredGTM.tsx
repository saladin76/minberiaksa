"use client";

import { useEffect } from "react";

const GTM_ID = "GTM-MMNBQQWB";
const IDLE_DELAY_MS = 6000;
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
      window.removeEventListener("scroll", loadGtm);
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

    timeoutId = setTimeout(loadGtm, IDLE_DELAY_MS);
    window.addEventListener("scroll", loadGtm, { passive: true, once: true });
    window.addEventListener("pointerdown", loadGtm, { once: true });
    window.addEventListener("keydown", loadGtm, { once: true });
    window.addEventListener("touchstart", loadGtm, { passive: true, once: true });

    return cleanup;
  }, []);

  return null;
}
