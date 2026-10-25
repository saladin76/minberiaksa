"use client";

import { useEffect } from "react";
import Clarity from "@microsoft/clarity";
import { isMeasurementHost } from "@/lib/tracking/engagement-policy";

// Verified against the live script tag and supplied project exports on 2026-10-25.
// An explicitly configured project ID remains authoritative.
const DEFAULT_CLARITY_PROJECT_ID = "u60r8zhrzh";

declare global {
  interface Window {
    __clarityInitialized?: boolean;
  }
}

/** Load once, only on explicitly allowed production hosts, before engagement. */
export default function MicrosoftClarity() {
  useEffect(() => {
    if (typeof window === "undefined" || !isMeasurementHost(window.location.hostname)) return;
    if (window.__clarityInitialized) return;
    const id = process.env.NEXT_PUBLIC_CLARITY_ID?.trim() || DEFAULT_CLARITY_PROJECT_ID;
    try {
      Clarity.init(id);
      window.__clarityInitialized = true;
    } catch (err) {
      // Measurement must never interrupt the application.
      if (process.env.NODE_ENV !== "production") console.warn("[clarity] init failed", err);
    }
  }, []);

  return null;
}
