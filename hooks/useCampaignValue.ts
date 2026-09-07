'use client'
import { useEffect, useState } from 'react';
import Cookies from 'js-cookie';

interface ExchangeRates {
  rates: { [key: string]: number };
  time_last_update_utc: string; // API provides the last update time
}

const CACHE_DURATION = 50 * 60 * 1000; // align with server hourly refresh

// Function to fetch exchange rates (our API reads from DB; one credit-free path for users)
const fetchExchangeRates = async (): Promise<ExchangeRates> => {
  const response = await fetch("/api/exchange/rates", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to fetch exchange rates");
  }
  const data = await response.json();
  if (data.result !== "success" || (!data.conversion_rates && !data.rates)) {
    throw new Error("Invalid exchange rate payload");
  }
  const rates = (data.conversion_rates || data.rates) as Record<string, number>;
  const ts = data.time_last_update_utc || data.updatedAt || new Date().toISOString();
  return {
    rates,
    time_last_update_utc: ts,
  };
};

// Function to get cached exchange rates from localStorage
const getCachedExchangeRates = (): ExchangeRates | null => {
  const cachedExchangeRatesString = localStorage.getItem('cachedExchangeRates');
  if (cachedExchangeRatesString) {
    const cachedExchangeRates: ExchangeRates = JSON.parse(cachedExchangeRatesString);
    const lastUpdateTime = new Date(cachedExchangeRates.time_last_update_utc).getTime();
    if (Date.now() - lastUpdateTime < CACHE_DURATION) {
      return cachedExchangeRates;
    }
  }
  return null;
};

// Hook for campaign value conversion
const useCampaignValue = (campaignValue: number): number | null => {
  const [convertedValue, setConvertedValue] = useState<number | null>(null);

  useEffect(() => {
    const currency = Cookies.get('currency') || 'USD'; // Get currency from cookies (default to USD)

    const fetchAndCacheExchangeRates = async () => {
      try {
        const exchangeRates = await fetchExchangeRates();
        localStorage.setItem('cachedExchangeRates', JSON.stringify(exchangeRates));
        const exchangeRate = exchangeRates.rates[currency];
        if (exchangeRate) {
          setConvertedValue(campaignValue * exchangeRate);
        } else {
          console.error('Currency not found in exchange rates');
        }
      } catch (error) {
        console.error('Failed to fetch exchange rates:', error);
      }
    };

    const cachedExchangeRates = getCachedExchangeRates();
    if (cachedExchangeRates) {
      const exchangeRate = cachedExchangeRates.rates[currency];
      if (exchangeRate) {
        setConvertedValue(campaignValue * exchangeRate);
      } else {
        console.error('Currency not found in exchange rates');
      }
    } else {
      fetchAndCacheExchangeRates();
    }
  }, [campaignValue]);

  return convertedValue;
};

// Currency code → display symbol (for amounts)
export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  TRY: '₺',
  SAR: 'ر.س',
  AED: 'د.إ',
  KWD: 'د.ك',
  EGP: 'ج.م',
  QAR: 'ر.ق',
  BHD: 'د.ب',
  OMR: 'ر.ع.‏',
};

/** Returns currency code (e.g. 'USD'). */
export const getCurrency = (): string => {
  return typeof window === 'undefined' ? 'USD' : (Cookies.get('currency') || 'USD');
};

/** Returns the display symbol for the current currency (e.g. '$', '€'). */
export const getCurrencySymbol = (): string => {
  const code = getCurrency();
  return CURRENCY_SYMBOLS[code] ?? code + ' ';
};


export default useCampaignValue;