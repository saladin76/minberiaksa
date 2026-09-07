"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTracking } from "@/components/TrackingPixels";

/** Sends canonical PageView on Next.js client-side route changes.
 * The initial browser PageView is still owned by the pixel bootstrap/init path.
 */
export function RoutePageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tracking = useTracking();
  const mounted = useRef(false);
  const lastKey = useRef("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = searchParams.toString();
    const key = `${pathname || "/"}${query ? `?${query}` : ""}`;
    if (!mounted.current) {
      mounted.current = true;
      lastKey.current = key;
      return;
    }
    if (lastKey.current === key) return;
    lastKey.current = key;

    const url = `${window.location.origin}${key}`;
    tracking?.trackPageView(url, document.title);
  }, [pathname, searchParams, tracking]);

  return null;
}
