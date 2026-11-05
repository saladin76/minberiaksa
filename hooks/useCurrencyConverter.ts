import { useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import { currencyCookieName, onDashboard } from '@/lib/dashboard/currency';
import { CURRENCY_COOKIE_UPDATED_EVENT } from '@/components/CurrencyFromUrlSync';

const CACHE_KEY = "cachedExchangeRates";
/** Slightly under 1h so we pick up server hourly refresh without extra third-party API calls. */
const CACHE_DURATION = 50 * 60 * 1000;

/* Every price on a page asks for the selected currency, and js-cookie re-parses
   the whole cookie string (tracking cookies included) on each call  the
   homepage profile showed ~0.2 s in that parser. The parse is redone only when
   `document.cookie` itself has changed, so a new selection is still seen at once. */
let lastCookieString: string | null = null;
let lastCookieName = "";
let lastSelectedCurrency = "DEFAULT";
function readSelectedCurrency(): string {
  if (typeof document === "undefined") return "DEFAULT";
  const cookieName = currencyCookieName(onDashboard(window.location.pathname));
  const raw = document.cookie;
  if (raw !== lastCookieString || cookieName !== lastCookieName) {
    lastCookieName = cookieName;
    lastCookieString = raw;
    lastSelectedCurrency = Cookies.get(cookieName) || "DEFAULT";
  }
  return lastSelectedCurrency;
}

const useCurrencyConverter = () => {
  const [exchangeRates, setExchangeRates] = useState<{ [key: string]: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  // Bumped on hydration and on currency-cookie change so every consumer
  // re-renders after middleware/`CurrencyFromUrlSync` settles the real selection.
  const [, setCurrencyTick] = useState(0);

  const fetchRates = async () => {
    try {
      const res = await fetch("/api/exchange/rates", { cache: "no-store" });
      const data = await res.json();
      if (data.result === "success" && (data.conversion_rates || data.rates)) {
        const map = (data.conversion_rates || data.rates) as Record<string, number>;
        setExchangeRates(map);
        const updated = data.time_last_update_utc || data.updatedAt || new Date().toISOString();
        try { localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            rates: map,
            timestamp: Date.now(),
            time_last_update_utc: updated,
          })
        ); } catch { /* Optional cache: valid server rates remain usable. */ }
      }
    } catch (err) {
      console.error("Failed to fetch exchange rates", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { rates, timestamp } = JSON.parse(cached);
      const valid = Date.now() - timestamp < CACHE_DURATION;
      if (valid) {
        setExchangeRates(rates);
        setLoading(false);
        return;
      }
    }
    } catch { /* A corrupt or unavailable browser cache cannot block prices. */ }
    fetchRates();
  }, []);

  useEffect(() => {
    // Hydration: re-read in case middleware set the cookie just before paint
    // (SSR `getSelectedCurrency` would otherwise resolve to DEFAULT).
    setHydrated(true);
    setCurrencyTick((n) => n + 1);
    const onUpdate = () => setCurrencyTick((n) => n + 1);
    window.addEventListener(CURRENCY_COOKIE_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(CURRENCY_COOKIE_UPDATED_EVENT, onUpdate);
  }, []);

  // Match the server's first render; a cookie-only first client render can
  // replace USD markup with TRY before hydration and force a React recovery.
  const getSelectedCurrency = () => hydrated ? readSelectedCurrency() : "DEFAULT";

  const convertToCurrency = (value: number) => {
    const currency = getSelectedCurrency();
    if (currency === "DEFAULT") return { convertedValue: value, currency: "USD", exchangeRate: 1 };
    if (!exchangeRates) return { convertedValue: null, currency: null, exchangeRate: null };
    const exchangeRate = exchangeRates[currency];
    if (!exchangeRate) return { convertedValue: null, currency, exchangeRate: null };
    return { convertedValue: value * exchangeRate, currency, exchangeRate };
  };

  return { convertToCurrency, getSelectedCurrency, exchangeRates, loading };
};

export default useCurrencyConverter;

