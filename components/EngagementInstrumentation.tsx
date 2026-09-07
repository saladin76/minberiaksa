"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { trackEngagement, clarityTag } from "@/lib/analytics";

/**
 * Mounts a tiny set of always-on listeners that record real engagement
 * milestones. Renders no DOM, mutates no UI — only attaches passive listeners
 * to existing window/document targets and reports through `lib/analytics`.
 *
 * Events emitted (Clarity custom event names; same names sent to GA4 / GTM):
 *   - landing_page_view       — first observed pathname per session
 *   - page_view_change        — every subsequent client-side route change
 *   - page_became_hidden      — visibilitychange → hidden (incl. tab close)
 *   - page_visible_again      — visibilitychange → visible (after first hide)
 *   - first_scroll            — once per route, on first scroll
 *   - first_click             — once per route, on first user click
 *   - rage_click              — 3+ pointerdowns within 1 s in a 50 px radius
 *   - donation_flow_started   — emitted from the donation dialog (separate hook)
 *   - outbound_link_click     — anchor with hostname ≠ current site
 *
 * Tags set on the Clarity session (filterable, alerts):
 *   - utm_source / utm_medium / utm_campaign / utm_content / utm_term — when present
 *   - fbclid / gclid / ttclid — when present
 *   - is_paid_traffic — "1" when any of the above are present, else "0"
 *
 * All listeners are passive, swallow errors, and de-register on unmount /
 * route change as appropriate.
 */
export default function EngagementInstrumentation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ─── First-visit landing + paid-traffic tagging ───────────────────────────
  // Runs ONCE per session (sessionStorage flag), independent of route changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const KEY = "_eng_landing";
      const already = sessionStorage.getItem(KEY);
      if (already) return;
      sessionStorage.setItem(KEY, "1");

      const url = new URL(window.location.href);
      const sp = url.searchParams;
      const paidKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid", "ttclid"];
      const paidParams: Record<string, string> = {};
      for (const k of paidKeys) {
        const v = sp.get(k);
        if (v) paidParams[k] = v;
      }
      const isPaid = Object.keys(paidParams).length > 0;

      // Clarity tags — make ad cohorts filterable in the Clarity dashboard.
      clarityTag("is_paid_traffic", isPaid ? "1" : "0");
      for (const [k, v] of Object.entries(paidParams)) clarityTag(k, v);
      if (document.referrer) {
        try {
          clarityTag("referrer_host", new URL(document.referrer).hostname);
        } catch {
          /* malformed referrer — skip */
        }
      }

      trackEngagement("landing_page_view", {
        path: url.pathname,
        ...paidParams,
        is_paid_traffic: isPaid ? 1 : 0,
        referrer: document.referrer || undefined,
      });

      if (process.env.NODE_ENV !== "production" && isPaid) {
        // eslint-disable-next-line no-console
        console.debug("[engagement] paid landing", paidParams);
      }
    } catch {
      /* noop */
    }
  }, []);

  // ─── visibilitychange — captures the "page hidden at 00:01" pattern ───────
  // Mounted once for the lifetime of the SPA; emits on every transition.
  useEffect(() => {
    if (typeof document === "undefined") return;
    let firstHideSent = false;
    let firstVisibleAgainSent = false;
    let hideStartedAt: number | null = null;

    const onVisibility = () => {
      try {
        if (document.visibilityState === "hidden") {
          if (!firstHideSent) {
            firstHideSent = true;
            hideStartedAt = Date.now();
            const sinceLoad = Math.round(performance.now());
            trackEngagement("page_became_hidden", {
              ms_since_navigation_start: sinceLoad,
              path: window.location.pathname,
            });
          }
        } else if (document.visibilityState === "visible") {
          if (firstHideSent && !firstVisibleAgainSent) {
            firstVisibleAgainSent = true;
            const hiddenFor = hideStartedAt ? Date.now() - hideStartedAt : null;
            trackEngagement("page_visible_again", {
              hidden_for_ms: hiddenFor ?? undefined,
              path: window.location.pathname,
            });
          }
        }
      } catch {
        /* noop */
      }
    };

    document.addEventListener("visibilitychange", onVisibility, { passive: true });
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // ─── Per-route flags: first_scroll, first_click, rage_click, page_view_change
  // Re-bound on every pathname/search change so each route gets its own
  // "first" milestones.
  const isFirstRouteRef = useRef(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isFirstRouteRef.current) {
      isFirstRouteRef.current = false;
    } else {
      trackEngagement("page_view_change", {
        path: pathname,
        search: searchParams?.toString() || undefined,
      });
      // Tag Clarity with the current path so sessions can be filtered by route.
      clarityTag("page", pathname);
    }

    let firstScrollSent = false;
    let firstClickSent = false;

    const onScroll = () => {
      if (firstScrollSent) return;
      firstScrollSent = true;
      window.removeEventListener("scroll", onScroll);
      try {
        trackEngagement("first_scroll", {
          ms_since_navigation_start: Math.round(performance.now()),
          path: pathname,
        });
      } catch {
        /* noop */
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!firstClickSent) {
        firstClickSent = true;
        try {
          trackEngagement("first_click", {
            ms_since_navigation_start: Math.round(performance.now()),
            path: pathname,
            target_tag: (e.target as Element | null)?.tagName?.toLowerCase(),
          });
        } catch {
          /* noop */
        }
      }
      // Rage-click detection: feed into a small ring buffer.
      pushRageSample(e);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("pointerdown", onPointerDown, { passive: true, capture: true });

    // Outbound link click delegation — captures clicks on anchors anywhere
    // without modifying the DOM.
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      const anchor = target.closest("a") as HTMLAnchorElement | null;
      if (!anchor || !anchor.href) return;
      try {
        const linkHost = new URL(anchor.href, window.location.href).hostname;
        if (!linkHost) return;
        if (linkHost !== window.location.hostname) {
          trackEngagement("outbound_link_click", {
            href: anchor.href,
            target_host: linkHost,
            path: pathname,
          });
        }
      } catch {
        /* malformed href — skip */
      }
    };
    document.addEventListener("click", onClick, { passive: true, capture: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointerdown", onPointerDown, { capture: true } as EventListenerOptions);
      document.removeEventListener("click", onClick, { capture: true } as EventListenerOptions);
      resetRageBuffer();
    };
  }, [pathname, searchParams]);

  return null;
}

// ─── Rage-click detection (lightweight, no extra deps) ──────────────────────
// 3+ pointerdowns within 1 s and within a 50 px radius → fire once per route.
let rageSamples: { x: number; y: number; t: number }[] = [];
let rageFiredForBurst = false;

function pushRageSample(e: PointerEvent) {
  try {
    const now = e.timeStamp || performance.now();
    rageSamples.push({ x: e.clientX, y: e.clientY, t: now });
    // Only consider events from the last 1000 ms.
    rageSamples = rageSamples.filter((s) => now - s.t <= 1000);
    if (rageSamples.length < 3) {
      rageFiredForBurst = false;
      return;
    }
    if (rageFiredForBurst) return;
    const last = rageSamples[rageSamples.length - 1];
    const tight = rageSamples.every(
      (s) => Math.hypot(s.x - last.x, s.y - last.y) <= 50
    );
    if (!tight) return;
    rageFiredForBurst = true;
    trackEngagement("rage_click", {
      x: last.x,
      y: last.y,
      samples: rageSamples.length,
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
    });
  } catch {
    /* noop */
  }
}

function resetRageBuffer() {
  rageSamples = [];
  rageFiredForBurst = false;
}
