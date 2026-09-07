"use client";

import { useEffect } from "react";
import Clarity from "@microsoft/clarity";

/**
 * Microsoft Clarity loader (uses the official @microsoft/clarity SDK).
 *
 * Why this exists
 * ---------------
 * Clarity used to be loaded only via GTM, and GTM is deferred 6 s or until the
 * first user interaction (DeferredGTM.tsx). Paid Meta/Facebook traffic that
 * bounces in 2–4 s never gave GTM a chance to fire, so Clarity recordings
 * either didn't exist or started literally at the moment the tab was closing —
 * exactly what produced the "Page hidden 00:01" pattern.
 *
 * Behaviour now
 * -------------
 * - Bundled directly via the SDK; runs on first client mount.
 * - Project ID falls back to the org's known value (u614k028k2), so it works
 *   without any env setup. Override with NEXT_PUBLIC_CLARITY_ID if needed.
 * - Initializes exactly once per page load (guarded with a window-level flag),
 *   even if the component re-mounts during client navigation.
 * - Survives client-side route changes — Next renders this once at the root
 *   layout level.
 *
 * Operational note
 * ----------------
 * If your GTM container still has a Clarity tag, remove it so we don't
 * double-record. Each page now loads Clarity exactly once via this component.
 */

const DEFAULT_CLARITY_PROJECT_ID = "u614k028k2";

declare global {
  interface Window {
    __clarityInitialized?: boolean;
  }
}

export default function MicrosoftClarity() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.__clarityInitialized) return;

    const id = process.env.NEXT_PUBLIC_CLARITY_ID?.trim() || DEFAULT_CLARITY_PROJECT_ID;
    if (!id) return;

    try {
      Clarity.init(id);
      window.__clarityInitialized = true;
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.debug("[clarity] initialized", id);
      }
    } catch (err) {
      // Tracking should never throw to the app.
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn("[clarity] init failed", err);
      }
    }
  }, []);

  return null;
}
