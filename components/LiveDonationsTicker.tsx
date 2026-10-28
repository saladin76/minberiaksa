"use client";

import { useEffect, useRef, useState } from "react";
import { HandCoins } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useTranslations, useLocale } from "next-intl";
import { AnimatePresence, motion } from "motion/react";
import { useCurrency } from "@/context/CurrencyContext";
import { generateTickerDisplay, type TickerAmountRange, type PublicTickerEntry } from "@/lib/donations/public-ticker-display";

interface TickerConfig {
  enabled: boolean;
  entries?: PublicTickerEntry[];
  donorNames: string[];
  amountRanges: TickerAmountRange[];
  minIntervalSeconds: number;
  maxIntervalSeconds: number;
}

interface DonationDisplay {
  name: string;
  amount: number | null;
  currency?: string | null;
  source?: string;
  at?: string | null;
  categoryName: string | null;
  id: number;
}

const DISPLAY_MAX_MS = 5000;

export default function LiveDonationsGlass() {
  const t = useTranslations("LiveDonationsTicker");
  const locale = useLocale();
  const isRTL = locale === "ar" || locale === "ur";
  const { convertToCurrency } = useCurrency();
  const [config, setConfig] = useState<TickerConfig | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [currentDonation, setCurrentDonation] = useState<DonationDisplay | null>(null);
  const nextId = useRef(0);
  const seenDonations = useRef(new Set<string>());
  const communityIndex = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [tickerResponse, categoriesResponse] = await Promise.all([
          fetch("/api/live-donation-ticker", { cache: "no-store" }),
          fetch(`/api/categories?locale=${encodeURIComponent(locale)}&limit=100`, { cache: "no-store" }),
        ]);
        if (!tickerResponse.ok) throw new Error("Failed to load ticker configuration");
        const ticker = await tickerResponse.json();
        if (cancelled) return;
        if (ticker.enabled === true && Array.isArray(ticker.donorNames) && Array.isArray(ticker.amountRanges)) {
          setConfig({
            enabled: true,
            ...(Array.isArray(ticker.entries) ? { entries: ticker.entries } : {}),
            donorNames: ticker.donorNames.filter((name: unknown): name is string => typeof name === "string" && name.trim().length > 0),
            amountRanges: ticker.amountRanges,
            minIntervalSeconds: Number.isInteger(ticker.minIntervalSeconds) ? ticker.minIntervalSeconds : 3,
            maxIntervalSeconds: Number.isInteger(ticker.maxIntervalSeconds) ? ticker.maxIntervalSeconds : 8,
          });
        } else {
          setConfig(null);
        }
        if (categoriesResponse.ok) {
          const data = await categoriesResponse.json();
          if (!cancelled) setCategories((data.items ?? []).map((item: { name?: string }) => item.name).filter((name: unknown): name is string => typeof name === "string" && Boolean(name.trim())));
        }
      } catch (error) {
        console.error("Error loading configured donation ticker:", error);
        if (!cancelled) setConfig(null);
      }
    };
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 10000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [locale]);

  useEffect(() => {
    if (!config?.enabled || (!config.entries && (!config.donorNames.length || !config.amountRanges.length))) return;
    let stopped = false;
    let showTimer: number | undefined;
    let hideTimer: number | undefined;

    const showNext = () => {
      if (stopped) return;
      if (document.hidden) { showTimer = window.setTimeout(showNext, 1500); return; }
      const fresh = config.entries?.find(entry => entry.source === "DONATION" && !seenDonations.current.has(entry.key));
      const community = config.entries?.filter(entry => entry.source === "COMMUNITY") || [];
      const entry = fresh || (community.length ? community[communityIndex.current++ % community.length] : null);
      const legacy = config.entries ? null : generateTickerDisplay(config, categories);
      if (fresh) seenDonations.current.add(fresh.key);
      const display = entry ? { ...entry, categoryName: null } : legacy ? { ...legacy, amount: null, source: "DISPLAY" } : null;
      if (display) setCurrentDonation({ ...display, id: ++nextId.current }); else setCurrentDonation(null);

      const minMs = Math.max(3000, config.minIntervalSeconds * 1000);
      const maxMs = Math.max(minMs, config.maxIntervalSeconds * 1000);
      const intervalMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
      hideTimer = window.setTimeout(() => setCurrentDonation(null), Math.min(DISPLAY_MAX_MS, intervalMs));
      showTimer = window.setTimeout(showNext, intervalMs);
    };

    showTimer = window.setTimeout(showNext, 1200);
    return () => {
      stopped = true;
      if (showTimer !== undefined) window.clearTimeout(showTimer);
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
    };
  }, [config, categories]);

  if (!config?.enabled) return null;

  const formatMoney = (amount: number, currency = "USD") => {
    if (currency !== "USD") return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
    const converted = convertToCurrency(amount);
    if (converted?.convertedValue != null && converted.currency) {
      try {
        return new Intl.NumberFormat(locale, { style: "currency", currency: converted.currency, maximumFractionDigits: 0 }).format(converted.convertedValue);
      } catch {
        return `${converted.convertedValue.toLocaleString(locale)} ${converted.currency}`;
      }
    }
    return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
  };

  return (
    <div
      className={cn(
        "fixed bottom-6 z-50 pointer-events-none left-1/2 -translate-x-1/2",
        isRTL ? "md:left-6 md:right-auto md:translate-x-0" : "md:right-6 md:left-auto md:translate-x-0",
        "rounded-xl w-max",
      )}
      dir={isRTL ? "rtl" : "ltr"}
      aria-live="polite"
      aria-atomic="true"
    >
      <AnimatePresence mode="wait">
        {currentDonation && (
          <motion.div
            key={currentDonation.id}
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="w-full"
          >
            <Card className="w-[280px] sm:w-[300px] border border-white/30 bg-white/90 shadow-md shadow-black/10 backdrop-blur-md dark:bg-gray-900/90">
              <div className="flex items-center gap-2.5 p-3">
                <span className="shrink-0 rounded-full bg-sky-500/90 p-1.5 text-white">
                  <HandCoins className="h-3.5 w-3.5" />
                </span>
                <div className={cn("min-w-0 flex-1", isRTL ? "text-right" : "text-left")}>
                  <p className="block truncate text-xs font-semibold leading-snug text-gray-800 dark:text-gray-100">
                    {currentDonation.name}
                  </p>
                  <p className="text-xs leading-snug text-gray-600 dark:text-gray-300">
                    {currentDonation.source === "DONATION" && currentDonation.amount !== null ? <>{t("donated")} <span className="font-semibold text-sky-700 dark:text-sky-300">{formatMoney(currentDonation.amount, currentDonation.currency || "USD")}</span></> : t("communitySupporter")}
                    {currentDonation.categoryName ? <> {t("for")} {currentDonation.categoryName}</> : null}
                  </p>
                </div>
                <span className="shrink-0 whitespace-nowrap text-[10px] text-gray-500 dark:text-gray-400">{currentDonation.at ? new Intl.DateTimeFormat(locale, {hour:"2-digit",minute:"2-digit",timeZone:"Europe/Istanbul"}).format(new Date(currentDonation.at)) : ""}</span>
              </div>
              <div className="h-px w-full bg-gradient-to-r from-transparent via-sky-400/30 to-transparent" />
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
