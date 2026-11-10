"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Clarity from "@microsoft/clarity";
import { isMeasurementHost } from "@/lib/tracking/engagement-policy";
import { isPublicAnalyticsPath } from "@/lib/tracking/private-path";
import { normalizeClarityProjectId } from "@/lib/tracking/clarity-config";
import { whenMarketingAllowed } from "@/lib/tracking/marketing-gate";

declare global {
  interface Window {
    __clarityInitialized?: boolean;
    __clarityLoadedProjectId?: string;
  }
}

type PublicClaritySettings = {
  clarityProjectId?: unknown;
  clarityEnabled?: unknown;
};

function privacyAllowsRecorder(): boolean {
  if (typeof navigator === "undefined") return false;
  // Respect browser opt-out signals and explicit analytics cookie rejection.
  const signals = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (signals.globalPrivacyControl === true || navigator.doNotTrack === "1") return false;
  const cookie = typeof document === "undefined" ? "" : document.cookie;
  return !/(?:^|;\s*)(?:analytics_consent|tracking_consent)=(?:denied|rejected|false|0)(?:;|$)/i.test(cookie);
}

/**
 * A runtime read, not a NEXT_PUBLIC_ID-only build. Never initialize in the
 * dashboard or private donation/account routes, and never initialize twice.
 * The global marketing gate defers loading until interaction or browser idle.
 */
export default function MicrosoftClarity() {
  const pathname = usePathname();
  useEffect(() => {
    if (typeof window === "undefined" || !isMeasurementHost(window.location.hostname) ||
      !isPublicAnalyticsPath(pathname || window.location.pathname) ||
      !privacyAllowsRecorder() || window.__clarityInitialized) return;

    const controller = new AbortController();
    let active = true;
    const cancelGate = whenMarketingAllowed(() => {
      void fetch("/api/tracking/config", {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      }).then(response => {
        if (!response.ok) throw new Error("tracking config unavailable");
        return response.json() as Promise<PublicClaritySettings>;
      }).then(config => {
        if (!active || !privacyAllowsRecorder() ||
          !isPublicAnalyticsPath(window.location.pathname) ||
          config.clarityEnabled !== true || window.__clarityInitialized) return;
        const id = normalizeClarityProjectId(config.clarityProjectId);
        if (!id) return;
        try {
          Clarity.init(id);
          window.__clarityInitialized = true;
          window.__clarityLoadedProjectId = id;
        } catch {
          // Analytics failure must never affect checkout or donor navigation.
        }
      }).catch(() => {
        // Fail closed: never use an embedded fallback if runtime config fails.
      });
    });

    return () => { active = false; controller.abort(); cancelGate(); };
  }, [pathname]);
  return null;
}
