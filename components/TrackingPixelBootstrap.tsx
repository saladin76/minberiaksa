"use client";

import { useEffect } from "react";

/**
 * TrackingPixels intentionally waits for user interaction or a long idle timeout
 * before loading marketing scripts. That protected performance, but it also made
 * ad-platform readings miss short visits. This lightweight bootstrap triggers the
 * existing interaction gate without changing the conversion/deduplication logic
 * inside TrackingPixels (DeferredGTM listens for the same event).
 *
 * It fires once the page has loaded and the main thread is idle, not straight
 * after mount: from mount it pulled GTM, GA4, Ads, Meta and TikTok (~1.2 MB,
 * ~3 s of script on a mid-range phone) into the middle of hydration, which is
 * most of the homepage's PageSpeed Total Blocking Time. A visit that lasts past
 * `load` is still counted.
 */
export function TrackingPixelBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let idleId: number | null = null;
    let timer: number | null = null;

    const fire = () => {
      try {
        window.dispatchEvent(new Event("pointerdown"));
      } catch {
        // Never block rendering if synthetic event dispatch is unavailable.
      }
    };
    const whenIdle = () => {
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(fire, { timeout: 3000 });
      } else {
        timer = window.setTimeout(fire, 1500);
      }
    };

    if (document.readyState === "complete") whenIdle();
    else window.addEventListener("load", whenIdle, { once: true });

    return () => {
      window.removeEventListener("load", whenIdle);
      if (idleId !== null) window.cancelIdleCallback(idleId);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  return null;
}
