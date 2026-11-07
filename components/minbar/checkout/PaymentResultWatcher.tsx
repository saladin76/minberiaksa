"use client";
import { useEffect } from "react";
import { albarakaResultPath, navigatePaymentResult } from "@/lib/minbar/payment-handoff";
import { clearCart } from "@/lib/minbar/cart";

/** Read-only checks; never retries initiation or calls a payment provider. */
export default function PaymentResultWatcher({ donationId, locale, token }: { donationId: string; locale: string; token?: string | null }) {
  useEffect(() => {
    if (!/^[a-f\d]{24}$/i.test(donationId)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;
    let checks = 0;
    const result = albarakaResultPath(donationId, locale, token);
    const check = async () => {
      if (cancelled) return;
      checks++;
      request = new AbortController();
      const current = request;
      const timeout = setTimeout(() => current.abort(), 8000);
      try {
        const response = await fetch(`${result}&view=status`, { cache: "no-store", credentials: "same-origin", signal: current.signal });
        if (response.status === 401 || response.status === 403 || response.status === 404) return;
        const payload = response.ok ? await response.json() : null;
        if (!cancelled && (payload?.state === "paid" || payload?.state === "failed")) {
          navigatePaymentResult(result, clearCart, url => window.location.replace(url));
          return;
        }
      } catch { /* A network interruption is not a bank decline. */ }
      finally { clearTimeout(timeout); }
      if (!cancelled && checks < 40) timer = setTimeout(check, 2500);
    };
    void check();
    return () => { cancelled = true; clearTimeout(timer); request?.abort(); };
  }, [donationId, locale, token]);
  return null;
}
