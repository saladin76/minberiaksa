"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Cookies from "js-cookie";
import { ChevronDown } from "lucide-react";
import {
  isValidCurrencyParam,
  normalizeCurrencyParamToCookie,
} from "@/lib/currency-link";
import { SUPPORTED_CURRENCY_OPTIONS } from "@/lib/supported-currencies";
import { CURRENCY_COOKIE_UPDATED_EVENT } from "@/components/CurrencyFromUrlSync";

export const DEFAULT_CURRENCY_CODE = "DEFAULT";

const currencies = [
  { code: DEFAULT_CURRENCY_CODE, symbol: "•", name: "Default" },
  ...SUPPORTED_CURRENCY_OPTIONS,
];

const CACHE_KEY = "cachedExchangeRates";
const CACHE_DURATION = 50 * 60 * 1000;

type CurrencySelectorProps = {
  showDefaultCurrencyOption?: boolean;
  onDark?: boolean;
};

function CurrencySelectorInner({
  showDefaultCurrencyOption = false,
  onDark = true,
}: CurrencySelectorProps) {
  const searchParams = useSearchParams();
  const [selectedCurrency, setSelectedCurrency] = useState(
    showDefaultCurrencyOption ? DEFAULT_CURRENCY_CODE : "USD"
  );
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const visibleCurrencies = showDefaultCurrencyOption
    ? currencies
    : currencies.filter((c) => c.code !== DEFAULT_CURRENCY_CODE);

  const applyCookieToUi = useCallback(
    (saved: string | undefined) => {
      if (!showDefaultCurrencyOption) {
        if (!saved || saved === DEFAULT_CURRENCY_CODE) {
          Cookies.set("currency", "USD", { expires: 365 });
          setSelectedCurrency("USD");
          return;
        }
        setSelectedCurrency(saved);
        return;
      }
      setSelectedCurrency(saved || DEFAULT_CURRENCY_CODE);
    },
    [showDefaultCurrencyOption]
  );

  /** URL param wins; then cookie. Keeps selector in sync on client navigations (?currency=). */
  const syncFromUrlAndCookie = useCallback(() => {
    const raw = searchParams.get("currency");
    if (raw && isValidCurrencyParam(raw)) {
      const normalized = normalizeCurrencyParamToCookie(raw);
      if (!showDefaultCurrencyOption && normalized === DEFAULT_CURRENCY_CODE) {
        Cookies.set("currency", "USD", { expires: 365 });
        setSelectedCurrency("USD");
        return;
      }
      Cookies.set("currency", normalized, { expires: 365 });
      setSelectedCurrency(normalized);
      return;
    }
    applyCookieToUi(Cookies.get("currency"));
  }, [searchParams, showDefaultCurrencyOption, applyCookieToUi]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    syncFromUrlAndCookie();
  }, [syncFromUrlAndCookie]);

  useEffect(() => {
    const onExternalCookie = (e: Event) => {
      const code = (e as CustomEvent<{ code?: string }>).detail?.code;
      if (!code || !isValidCurrencyParam(code)) return;
      const normalized = normalizeCurrencyParamToCookie(code);
      if (!showDefaultCurrencyOption && normalized === DEFAULT_CURRENCY_CODE) {
        Cookies.set("currency", "USD", { expires: 365 });
        setSelectedCurrency("USD");
        return;
      }
      setSelectedCurrency(normalized);
    };
    window.addEventListener(CURRENCY_COOKIE_UPDATED_EVENT, onExternalCookie);
    return () => window.removeEventListener(CURRENCY_COOKIE_UPDATED_EVENT, onExternalCookie);
  }, [showDefaultCurrencyOption]);

  useEffect(() => {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { rates, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_DURATION) {
        setExchangeRates(rates);
        return;
      }
    }
    fetch("/api/exchange/rates", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.result === "success" && (data.conversion_rates || data.rates)) {
          const rates = (data.conversion_rates || data.rates) as Record<string, number>;
          setExchangeRates(rates);
          const updated = data.time_last_update_utc || data.updatedAt || new Date().toISOString();
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
              rates,
              timestamp: Date.now(),
              time_last_update_utc: updated,
            })
          );
        }
      })
      .catch(console.error);
  }, []);

  const handleChange = (code: string) => {
    setSelectedCurrency(code);
    Cookies.set("currency", code, { expires: 365 });
    setOpen(false);
    window.location.reload();
  };

  const current =
    visibleCurrencies.find((c) => c.code === selectedCurrency) ??
    visibleCurrencies.find((c) => c.code === "USD");

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors text-sm font-medium ${
          onDark
            ? "text-white/90 hover:text-white hover:bg-white/10"
            : "text-gray-700 hover:text-[#A5243D] hover:bg-gray-100"
        }`}
      >
        <span className="font-bold">{current?.symbol}</span>
        <span>
          {current?.code === DEFAULT_CURRENCY_CODE ? "Default" : selectedCurrency}
        </span>
        <ChevronDown
          className={`w-3 h-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-44 rounded-xl border border-gray-100 bg-white shadow-lg overflow-hidden">
          {visibleCurrencies.map((curr) => (
            <button
              key={curr.code}
              type="button"
              onClick={() => handleChange(curr.code)}
              className={`flex w-full items-center justify-between px-4 py-2.5 text-sm transition-colors
                ${
                  selectedCurrency === curr.code
                    ? "bg-blue-50 text-[#A5243D] font-semibold"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
            >
              <span>{curr.name}</span>
              <span className="font-bold text-xs">{curr.symbol}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CurrencySelectorFallback({ onDark = true }: { onDark?: boolean }) {
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-sm font-medium min-h-[28px] min-w-[52px] ${
        onDark ? "text-white/50" : "text-gray-400"
      }`}
      aria-hidden
    >
      <span className="inline-block h-3 w-8 rounded bg-current opacity-30" />
    </div>
  );
}

export default function CurrencySelector(props: CurrencySelectorProps) {
  return (
    <Suspense fallback={<CurrencySelectorFallback onDark={props.onDark} />}>
      <CurrencySelectorInner {...props} />
    </Suspense>
  );
}
