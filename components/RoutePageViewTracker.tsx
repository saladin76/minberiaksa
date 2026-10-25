"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTracking } from "@/components/TrackingPixels";
import { measurementRouteKey, measurementUrl } from "@/lib/tracking/engagement-policy";

/** Sends canonical PageView on Next.js client-side route changes.
 * The initial browser PageView is still owned by the pixel bootstrap/init path.
 */
export function RoutePageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tracking = useTracking();
  const routeKey = measurementRouteKey(pathname || "/", searchParams.toString());
  const mounted = useRef(false);
  const lastKey = useRef("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = routeKey;
    if (!mounted.current) {
      mounted.current = true;
      lastKey.current = key;
      return;
    }
    if (lastKey.current === key) return;
    lastKey.current = key;

    const url = measurementUrl(key, window.location.origin);
    if (url) tracking?.trackPageView(url, document.title);
  }, [routeKey, tracking]);

  return null;
}
