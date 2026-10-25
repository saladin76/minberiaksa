"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { trackEngagement, clarityTag, isEngagementEnabled } from "@/lib/analytics";
import {
  createPointerBurstDetector,
  landingAttribution,
  measurementPath,
  measurementRouteKey,
  referrerOrigin,
} from "@/lib/tracking/engagement-policy";

/**
 * Passive diagnostics only. A landing is the first client mount per document,
 * not a Clarity session or a payment. Cosmetic currency cleanup is not a route.
 * rapid_pointer_burst is deliberately distinct from Clarity's native rage clicks.
 */
export default function EngagementInstrumentation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = measurementRouteKey(pathname || "/", searchParams.toString());
  const landingSent = useRef(false);
  const lastRoute = useRef<string | null>(null);

  useEffect(() => {
    if (!isEngagementEnabled() || landingSent.current) return;
    landingSent.current = true;
    const url = new URL(window.location.href);
    const attribution = landingAttribution(url.searchParams);
    for (const [key, value] of Object.entries(attribution)) clarityTag(key, String(value));
    const referrer = referrerOrigin(document.referrer);
    if (referrer) clarityTag("referrer_host", new URL(referrer).hostname);
    trackEngagement("landing_page_view", {
      path: url.pathname,
      ...attribution,
      referrer,
    });
  }, []);

  useEffect(() => {
    if (!isEngagementEnabled()) return;
    let hiddenAt: number | null = null;
    let visibleSent = false;
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && hiddenAt === null) {
        hiddenAt = Date.now();
        trackEngagement("page_became_hidden", {
          ms_since_navigation_start: Math.round(performance.now()),
          path: window.location.pathname,
        });
      } else if (document.visibilityState === "visible" && hiddenAt !== null && !visibleSent) {
        visibleSent = true;
        trackEngagement("page_visible_again", {
          hidden_for_ms: Date.now() - hiddenAt,
          path: window.location.pathname,
        });
      }
    };
    document.addEventListener("visibilitychange", onVisibility, { passive: true });
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!isEngagementEnabled()) return;
    const url = new URL(routeKey, window.location.origin);
    const path = measurementPath(url.pathname);
    if (lastRoute.current !== null && lastRoute.current !== routeKey) {
      trackEngagement("page_view_change", { path, search: url.search.slice(1) });
      clarityTag("page", path);
    }
    lastRoute.current = routeKey;

    let firstScrollSent = false;
    let firstClickSent = false;
    const detectBurst = createPointerBurstDetector();

    const onScroll = () => {
      if (firstScrollSent) return;
      firstScrollSent = true;
      window.removeEventListener("scroll", onScroll);
      trackEngagement("first_scroll", {
        ms_since_navigation_start: Math.round(performance.now()), path,
      });
    };
    const onPointerDown = (event: PointerEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      if (!firstClickSent) {
        firstClickSent = true;
        trackEngagement("first_click", {
          ms_since_navigation_start: Math.round(performance.now()),
          path, target_tag: element?.tagName.toLowerCase(),
        });
      }
      const samples = detectBurst({ x: event.clientX, y: event.clientY, t: event.timeStamp });
      if (samples) trackEngagement("rapid_pointer_burst", { samples, path });
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      try {
        const url = new URL(anchor.href, window.location.href);
        if (!["http:", "https:"].includes(url.protocol) || url.hostname === window.location.hostname) return;
        trackEngagement("outbound_link_click", { href: url.href, target_host: url.hostname, path });
      } catch {
        // Ignore invalid links; never change navigation or cancel the click.
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("pointerdown", onPointerDown, { passive: true, capture: true });
    document.addEventListener("click", onClick, { passive: true, capture: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [routeKey]);

  return null;
}
