"use client";

import { useLayoutEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Clarity from "@microsoft/clarity";
import { isMeasurementHost } from "@/lib/tracking/engagement-policy";
import { isPublicAnalyticsPath } from "@/lib/tracking/private-path";
import { normalizeClarityProjectId } from "@/lib/tracking/clarity-config";
import { whenMarketingAllowed } from "@/lib/tracking/marketing-gate";

declare global {
  interface Window {
    __clarityInitialized?: boolean;
    __clarityLoadedProjectId?: string;
    __claritySuspended?: boolean;
    clarity?: (...args: unknown[]) => void;
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
  const searchParams = useSearchParams();
  const searchKey = searchParams?.toString() ?? "";
  useLayoutEffect(() => {
    // Hash changes do not update usePathname/useSearchParams, but the document
    // URL may now contain a receipt token. Fail closed immediately.
    const stopOnPrivateFragment = () => {
      if (!window.__clarityInitialized || window.__claritySuspended) return;
      const href = window.location.pathname + window.location.search + window.location.hash;
      if (isPublicAnalyticsPath(href)) return;
      try { window.clarity?.("stop"); } catch { /* never affect navigation */ }
      window.__claritySuspended = true;
    };
    window.addEventListener("hashchange", stopOnPrivateFragment);
    return () => window.removeEventListener("hashchange", stopOnPrivateFragment);
  }, []);
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const allowed = isMeasurementHost(window.location.hostname) &&
      // Both router state and the live URL must be safe; they can briefly
      // disagree during a client transition. Fail closed instead of trusting
      // the still-public router state while the browser is on a private URL.
      (!pathname || isPublicAnalyticsPath(pathname + (searchKey ? `?${searchKey}` : ""))) &&
      isPublicAnalyticsPath(window.location.pathname + window.location.search + window.location.hash) &&
      privacyAllowsRecorder();
    // The recorder persists across client navigation: disabling only its
    // initial load would expose private SPA routes visited later. Stop it at
    // every sensitive route or privacy revocation without removing the script.
    if (!allowed) {
      if (window.__clarityInitialized && !window.__claritySuspended) {
        try {
          window.clarity?.("stop");
          window.__claritySuspended = true;
        } catch { /* never disrupt navigation */ }
      }
      return;
    }
    if (window.__clarityInitialized) {
      // A saved disable or project change must not resume an old recorder on
      // client navigation. Clarity's SDK is not safely re-initializable with
      // another project in the same document; a normal page reload uses the new ID.
      const controller = new AbortController();
      void fetch("/api/tracking/config", {
        cache: "no-store", credentials: "same-origin", signal: controller.signal,
      }).then(response => {
        if (!response.ok) throw new Error("tracking config unavailable");
        return response.json() as Promise<PublicClaritySettings>;
      }).then(config => {
        if (controller.signal.aborted) return;
        const currentId = normalizeClarityProjectId(config.clarityProjectId);
        const stillAllowed = privacyAllowsRecorder() &&
          isPublicAnalyticsPath(window.location.pathname + window.location.search + window.location.hash) &&
          config.clarityEnabled === true &&
          currentId !== null && currentId === window.__clarityLoadedProjectId;
        if (!stillAllowed) {
          try { window.clarity?.("stop"); } catch { /* fail closed */ }
          window.__claritySuspended = true;
        } else if (window.__claritySuspended) {
          try { window.clarity?.("start"); window.__claritySuspended = false; }
          catch { /* leave stopped */ }
        }
      }).catch(() => {
        if (controller.signal.aborted) return;
        try { window.clarity?.("stop"); } catch { /* fail closed */ }
        window.__claritySuspended = true;
      });
      return () => controller.abort();
    }

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
          !isPublicAnalyticsPath(window.location.pathname + window.location.search + window.location.hash) ||
          config.clarityEnabled !== true || window.__clarityInitialized) return;
        const id = normalizeClarityProjectId(config.clarityProjectId);
        if (!id) return;
        try {
          Clarity.init(id);
          window.__clarityInitialized = true;
          window.__claritySuspended = false;
          window.__clarityLoadedProjectId = id;
        } catch {
          // Analytics failure must never affect checkout or donor navigation.
        }
      }).catch(() => {
        // Fail closed: never use an embedded fallback if runtime config fails.
      });
    });

    return () => { active = false; controller.abort(); cancelGate(); };
  }, [pathname, searchKey]);
  return null;
}
