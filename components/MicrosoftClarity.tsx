"use client";

import { useEffect } from "react";
import Clarity from "@microsoft/clarity";
import { isMeasurementHost } from "@/lib/tracking/engagement-policy";
import { clarityProjectId } from "@/lib/tracking/clarity-config";

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
    const id = clarityProjectId();
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
