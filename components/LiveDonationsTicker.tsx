"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { HandCoins } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useTranslations, useLocale } from "next-intl";
import { AnimatePresence, motion } from "motion/react";
import { useCurrency } from "@/context/CurrencyContext";
import { formatNumber } from "@/hooks/formatNumber";
import { getCurrency } from "@/hooks/useCampaignValue";

interface AmountRange {
  minAmount: number;
  maxAmount: number;
  probability: number;
  label: string;
}

interface TickerConfig {
  donorNames: string[];
  amountRanges: AmountRange[];
  minIntervalSeconds: number;
  maxIntervalSeconds: number;
}

interface DonationDisplay {
  name: string;
  amount: number;
  categoryName: string | null;
  id: number;
}

const DISPLAY_MAX_MS = 5000;
const EXIT_DURATION_MS = 280;

export default function LiveDonationsGlass() {
  const t = useTranslations("LiveDonationsTicker");
  const locale = useLocale() as "ar" | "en" | "fr";
  const isRTL = locale === "ar";

  const { convertToCurrency } = useCurrency();
  const [config, setConfig] = useState<TickerConfig | null>(null);
  const [categories, setCategories] = useState<{ name: string }[]>([]);
  const [currentDonation, setCurrentDonation] = useState<DonationDisplay | null>(null);
  const [exiting, setExiting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hideAtTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearNullTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);
  const configRef = useRef(config);
  const categoriesRef = useRef(categories);
  configRef.current = config;
  categoriesRef.current = categories;

  const formatMoney = (n: number) => {
    const r = convertToCurrency(n);
    if (r?.convertedValue != null && r?.currency) {
      const sym =
        r.currency === "USD"
          ? "$"
          : r.currency === "EUR"
            ? "€"
            : r.currency === "GBP"
              ? "£"
              : r.currency === "TRY"
                ? "₺"
                : r.currency;
      const val =
        typeof r.convertedValue === "number"
          ? r.convertedValue.toLocaleString(undefined, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })
          : "0";
      return sym + " " + val;
    }
    return (
      "$" +
      (typeof n === "number"
        ? n.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })
        : "0")
    );
  };

  const clearAllTimeouts = useCallback(() => {
    if (hideAtTimeoutRef.current) {
      clearTimeout(hideAtTimeoutRef.current);
      hideAtTimeoutRef.current = null;
    }
    if (clearNullTimeoutRef.current) {
      clearTimeout(clearNullTimeoutRef.current);
      clearNullTimeoutRef.current = null;
    }
    if (nextTimeoutRef.current) {
      clearTimeout(nextTimeoutRef.current);
      nextTimeoutRef.current = null;
    }
  }, []);

  // Fetch ticker config and categories (locale-aware)
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const [tickerRes, categoriesRes] = await Promise.all([
          fetch("/api/live-donation-ticker"),
          fetch(`/api/categories?locale=${locale}&limit=100`),
        ]);
        if (!tickerRes.ok) throw new Error("Failed to fetch ticker configuration");
        const data = await tickerRes.json();
        setConfig(data);

        if (categoriesRes.ok) {
          const catData = await categoriesRes.json();
          const names = (catData.items || [])
            .map((c: { name?: string }) => ({ name: c.name || "" }))
            .filter((c: { name: string }) => c.name);
          setCategories(names);
        }
        setIsLoading(false);
      } catch (err) {
        console.error("Error fetching ticker config:", err);
        setError("Failed to load donation ticker");
        setIsLoading(false);
      }
    };

    fetchConfig();
  }, [locale]);

  const generateRandomDonation = useCallback((): DonationDisplay => {
    const cfg = configRef.current;
    const cats = categoriesRef.current;
    if (!cfg) {
      return { name: "Anonymous", amount: 50, categoryName: null, id: ++idRef.current };
    }

    const name =
      cfg.donorNames.length > 0
        ? cfg.donorNames[Math.floor(Math.random() * cfg.donorNames.length)]
        : "Anonymous";

    let amount = 50;
    if (cfg.amountRanges.length > 0) {
      const totalWeight = cfg.amountRanges.reduce((sum, range) => sum + range.probability, 0);
      let random = Math.random() * totalWeight;
      let selectedRange = cfg.amountRanges[0];
      for (const range of cfg.amountRanges) {
        random -= range.probability;
        if (random <= 0) {
          selectedRange = range;
          break;
        }
      }
      amount = Math.floor(
        Math.random() * (selectedRange.maxAmount - selectedRange.minAmount + 1) + selectedRange.minAmount
      );
    }

    const categoryName =
      cats.length > 0 ? cats[Math.floor(Math.random() * cats.length)].name : null;

    return { name, amount, categoryName, id: ++idRef.current };
  }, []);

  // Single scheduler: show donation, hide at min(5s, interval), show next at interval (no clash)
  useEffect(() => {
    if (!config) return;

    const showNext = () => {
      const next = generateRandomDonation();
      setCurrentDonation(next);
      setExiting(false);

      const minMs = config.minIntervalSeconds * 1000;
      const maxMs = config.maxIntervalSeconds * 1000;
      const intervalMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
      const hideAt = Math.min(DISPLAY_MAX_MS, intervalMs);

      hideAtTimeoutRef.current = setTimeout(() => {
        setExiting(true);
        hideAtTimeoutRef.current = null;
        clearNullTimeoutRef.current = setTimeout(() => {
          setCurrentDonation(null);
          setExiting(false);
          clearNullTimeoutRef.current = null;
        }, EXIT_DURATION_MS);
      }, hideAt);

      nextTimeoutRef.current = setTimeout(() => {
        clearAllTimeouts();
        nextTimeoutRef.current = null;
        showNext();
      }, intervalMs);
    };

    showNext();
    return () => clearAllTimeouts();
  }, [config, locale, generateRandomDonation, clearAllTimeouts]);

  if (isLoading || error) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed bottom-6 z-50 pointer-events-none",
        "left-1/2 -translate-x-1/2",
        isRTL
          ? "md:left-6 md:right-auto md:translate-x-0"
          : "md:right-6 md:left-auto md:translate-x-0",
        "rounded-xl w-max"
      )}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <AnimatePresence mode="wait">
        {currentDonation && !exiting && (
          <motion.div
            key={currentDonation.id}
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: EXIT_DURATION_MS / 1000, ease: "easeOut" }}
            className="w-full"
          >
            <Card
              className={cn(
                "w-[280px] sm:w-[300px] border border-white/30",
                "bg-white/85 backdrop-blur-md dark:bg-gray-900/85 backdrop-blur-md",
                "shadow-md shadow-black/10"
              )}
            >
              <div className="flex items-center gap-2.5 p-3">
                <div className="relative shrink-0">
                  <div className="relative bg-sky-500/90 text-white rounded-full p-1.5">
                    <HandCoins className="w-3.5 h-3.5" />
                  </div>
                </div>

                <div className={cn("flex-1 min-w-0", isRTL ? "text-right" : "text-left")}>
                  <p className="text-xs text-gray-700 dark:text-gray-200 leading-snug">
                    <span className="font-semibold truncate block">{currentDonation.name}</span>
                    <span className="text-gray-600 dark:text-gray-300">
                      {t("donated")}{" "}
                      <span className="font-semibold text-sky-600 dark:text-sky-400">
                      {
                        formatMoney(currentDonation.amount)
                    }
                    {" "}
                      </span>
                      {currentDonation.categoryName ? (
                        <>
                          {" "}
                          {t("for")} {currentDonation.categoryName}
                        </>
                      ) : null}
                    </span>
                  </p>
                </div>

                <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap shrink-0">
                  {t("now")}
                </span>
              </div>

              <div className="h-px w-full bg-gradient-to-r from-transparent via-sky-400/30 to-transparent" />
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
