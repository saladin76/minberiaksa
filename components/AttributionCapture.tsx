"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { captureAttributionFromUrl } from "@/lib/attribution/client-payload";

/** Persists UTM/click ids in cookies (30d) for donation attribution. */
export function AttributionCapture() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    captureAttributionFromUrl();
  }, [pathname, searchParams]);
  return null;
}
