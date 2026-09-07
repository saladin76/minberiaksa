"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Cookies from "js-cookie";
import {
  isValidCurrencyParam,
  normalizeCurrencyParamToCookie,
} from "@/lib/currency-link";

export const CURRENCY_COOKIE_UPDATED_EVENT = "app:currency-cookie-updated";

/** Lets client UI (e.g. `CurrencySelector`) react without a full page refresh. */
function dispatchCurrencyCookieUpdated(code: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CURRENCY_COOKIE_UPDATED_EVENT, { detail: { code } })
  );
}

/**
 * Syncs `?currency=` from the URL into the `currency` cookie, then strips
 * the param from the URL so shared links apply the currency silently.
 * When there is no URL param, ensures a default cookie (`USD`) if none is set.
 */
export function CurrencyFromUrlSync() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const raw = searchParams.get("currency");
    if (raw && isValidCurrencyParam(raw)) {
      const normalized = normalizeCurrencyParamToCookie(raw);
      Cookies.set("currency", normalized, { expires: 365 });
      dispatchCurrencyCookieUpdated(normalized);

      // Strip ?currency= from the URL so it doesn't persist
      const params = new URLSearchParams(searchParams.toString());
      params.delete("currency");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
      return;
    }
    if (!Cookies.get("currency")) {
      Cookies.set("currency", "USD", { expires: 365 });
      dispatchCurrencyCookieUpdated("USD");
    }
  }, [searchParams, pathname, router]);

  return null;
}
