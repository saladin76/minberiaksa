"use client";
import { useEffect, useRef } from "react";

export const DONATION_FINANCIAL_UPDATED = "donation-financial-updated";

/** Refresh the current latest page without polling hidden tabs or overlapping reads. */
export function useLiveDonationRefresh(refresh: () => Promise<unknown>, enabled: boolean) {
  const latest = useRef(refresh);
  useEffect(() => { latest.current = refresh; }, [refresh]);
  useEffect(() => {
    if (!enabled) return;
    let busy = false;
    const read = () => {
      if (document.visibilityState !== "visible" || busy) return;
      busy = true;
      void Promise.resolve(latest.current()).catch(() => {}).finally(() => { busy = false; });
    };
    const interval = window.setInterval(read, 30_000);
    window.addEventListener("focus", read);
    document.addEventListener("visibilitychange", read);
    window.addEventListener(DONATION_FINANCIAL_UPDATED, read);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", read); document.removeEventListener("visibilitychange", read); window.removeEventListener(DONATION_FINANCIAL_UPDATED, read); };
  }, [enabled]);
}
