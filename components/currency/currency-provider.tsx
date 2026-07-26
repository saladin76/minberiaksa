"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { currencies } from "@/config/currencies";
import type { CurrencyOption } from "@/config/currencies";

const STORAGE_KEY = "minber-active-currency-v1";
const DEFAULT_CODE = "USD";

type CurrencyContextValue = {
  currency: CurrencyOption;
  setCurrencyCode: (code: string) => void;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

function enabledCurrency(code: string | null | undefined) {
  return currencies.find((item) => item.enabled && item.code === code)
    ?? currencies.find((item) => item.enabled && item.code === DEFAULT_CODE)
    ?? currencies[0];
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<CurrencyOption>(() => enabledCurrency(DEFAULT_CODE));

  useEffect(() => {
    try {
      setCurrency(enabledCurrency(window.localStorage.getItem(STORAGE_KEY)));
    } catch {
      setCurrency(enabledCurrency(DEFAULT_CODE));
    }
  }, []);

  const setCurrencyCode = useCallback((code: string) => {
    const next = enabledCurrency(code);
    setCurrency(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next.code);
    } catch {
      // The active choice still works for the current page when storage is unavailable.
    }
  }, []);

  const value = useMemo(() => ({ currency, setCurrencyCode }), [currency, setCurrencyCode]);
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const value = useContext(CurrencyContext);
  if (!value) throw new Error("useCurrency must be used inside CurrencyProvider");
  return value;
}
