"use client";

import { useEffect } from "react";

/**
 * TrackingPixels intentionally waits for user interaction or a long idle timeout
 * before loading marketing scripts. That protected performance, but it also made
 * ad-platform readings miss short visits. This lightweight bootstrap triggers the
 * existing interaction gate immediately after React effects are mounted, without
 * changing the conversion/deduplication logic inside TrackingPixels.
 */
export function TrackingPixelBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      try {
        window.dispatchEvent(new Event("pointerdown"));
      } catch {
        // Never block rendering if synthetic event dispatch is unavailable.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
