"use client";

import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { Heart, CheckCircle, ChevronDown, Check, CarTaxiFront } from "lucide-react";
import { getCurrency } from "@/hooks/useCampaignValue";
import { usePathname, useRouter } from "@/i18n/routing";
import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { appendCurrencyQuery, getCurrencyCodeForLinks } from "@/lib/currency-link";
import { CardStackPlusIcon } from "@radix-ui/react-icons";

// DonationDialog pulls in @stripe/stripe-js (~230KiB) plus the Stripe utility script.
// Loading it lazily keeps Stripe out of the homepage critical path entirely.
const DonationDialog = dynamic(() => import("@/components/DonationDialog"), { ssr: false });

interface CategoryOption {
  id: string;
  name: string;
  image?: string | null;
}

interface HeroQuickDonateProps {
  /** Server-fetched categories — when provided we skip the client fetch + loading state,
   *  which means the SSR HTML already contains the final dropdown content (no CLS). */
  initialCategories?: CategoryOption[];
}

// Distinct from the QuickDonate section's resume key/param so the two donation
// cards on the homepage never reopen each other's dialog after a sign-in redirect.
const HERO_DONATE_RESUME_KEY = "heroQuickDonateResume";

const HeroQuickDonate: React.FC<HeroQuickDonateProps> = ({ initialCategories = [] }) => {
  const t = useTranslations("HeroSlider");
  const tQuick = useTranslations("QuickDonate");
  const tDonation = useTranslations("DonationDialog");
  const locale = useLocale() as "ar" | "en" | "fr";
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedAmount, setSelectedAmount] = useState<number | null>(500);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [categories, setCategories] = useState<CategoryOption[]>(initialCategories);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    initialCategories[0]?.id ?? ""
  );
  const [donationDialogOpen, setDonationDialogOpen] = useState(false);
  // Gate the actual mount so the Stripe / dialog chunk doesn't load on page paint.
  const [donationDialogMounted, setDonationDialogMounted] = useState(false);
  const [categoriesLoading, setCategoriesLoading] = useState(initialCategories.length === 0);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const [currencyLabel, setCurrencyLabel] = useState<string>("USD");
  const [stripeMinAmount, setStripeMinAmount] = useState(1);
  const [resumeAmount, setResumeAmount] = useState<number | undefined>(undefined);
  const [resumeCategoryId, setResumeCategoryId] = useState<string>("");
  const [resumeCategoryName, setResumeCategoryName] = useState<string>("");
  const [resumeCategoryImage, setResumeCategoryImage] = useState<string | undefined>(undefined);

  useEffect(() => {
    const cur = getCurrency();
    setCurrencyLabel(cur);
    if (cur !== "USD") {
      try {
        const cached = localStorage.getItem("cachedExchangeRates");
        if (cached) {
          const { rates } = JSON.parse(cached) as { rates: Record<string, number> };
          const rate = rates?.[cur];
          if (rate) setStripeMinAmount(Math.ceil(rate));
        }
      } catch { /* use default 1 */ }
    }
  }, []);

  // After sign-in redirect: restore selection, open donation dialog, clean URL
  useEffect(() => {
    if (searchParams.get("openHeroDonation") !== "1") return;
    try {
      const stored = typeof window !== "undefined" ? sessionStorage.getItem(HERO_DONATE_RESUME_KEY) : null;
      if (stored) {
        const data = JSON.parse(stored) as { categoryId?: string; categoryName?: string; categoryImage?: string; amount?: number };
        if (data.categoryId) setResumeCategoryId(data.categoryId);
        if (data.categoryName) setResumeCategoryName(data.categoryName);
        if (data.categoryImage) setResumeCategoryImage(data.categoryImage);
        if (typeof data.amount === "number" && data.amount > 0) setResumeAmount(data.amount);
        sessionStorage.removeItem(HERO_DONATE_RESUME_KEY);
      }
    } catch {
      /* ignore */
    }
    setDonationDialogMounted(true);
    setDonationDialogOpen(true);
    router.replace(
      appendCurrencyQuery(`${pathname}#hero_quick_donate`, getCurrencyCodeForLinks())
    );
  }, [searchParams, pathname, router]);

  // Close category dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target as Node)) {
        setCategoryDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Categories arrive as a prop from the server — only re-fetch on the client if the
  // server failed to populate them (e.g. /api/categories was 5xx during SSR).
  useEffect(() => {
    if (initialCategories.length > 0) return;
    let cancelled = false;
    const fetchCategories = async () => {
      try {
        const res = await fetch(`/api/categories?locale=${locale}&limit=100`);
        if (!res.ok) return;
        const data = await res.json();
        const items = (data.items || []).map((c: { id: string; name: string; image?: string | null }) => ({
          id: c.id,
          name: c.name || "",
          image: c.image ?? null,
        }));
        if (cancelled) return;
        setCategories(items);
        setSelectedCategoryId((prev) => prev || items[0]?.id || "");
      } catch (e) {
        console.error("Failed to fetch categories:", e);
      } finally {
        if (!cancelled) setCategoriesLoading(false);
      }
    };
    fetchCategories();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const displayAmount = selectedAmount ?? (customAmount ? parseFloat(customAmount) || 0 : 0);
  const belowMin = stripeMinAmount > 1 && displayAmount > 0 && displayAmount < stripeMinAmount;

  const storeResume = () => {
    if (!selectedCategoryId || !selectedCategory || displayAmount <= 0) return;
    if (typeof window === "undefined") return;
    sessionStorage.setItem(
      HERO_DONATE_RESUME_KEY,
      JSON.stringify({
        categoryId: selectedCategoryId,
        categoryName: selectedCategory.name,
        categoryImage: selectedCategory.image ?? undefined,
        amount: displayAmount,
      })
    );
  };

  const handleDonateClick = () => {
    if (!selectedCategoryId || !selectedCategory) return;
    if (displayAmount <= 0) return;
    setDonationDialogMounted(true);
    setDonationDialogOpen(true);
  };

  const quickAmounts = [100, 200, 300, 400, 500, 1000];

  return (
    <div
      id="hero_quick_donate"
      className="shape-card relative bg-white p-5 text-ink shadow-lift ring-1 ring-black/[0.04] sm:p-6"
    >
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-burgundy to-burgundyDark text-white shadow-soft">
          <Heart className="h-5 w-5" fill="currentColor" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-extrabold leading-tight text-deep sm:text-lg">{t("quickTitle")}</h3>
          <div className="mt-1.5 gold-mark-sm" />
        </div>
      </div>

      {/* Category */}
      <div ref={categoryDropdownRef} className="relative mb-3.5">
        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-gray-400">{tQuick("selectProject")}</label>
        <button
          type="button"
          onClick={() => !categoriesLoading && setCategoryDropdownOpen((o) => !o)}
          dir={locale === "ar" ? "rtl" : "ltr"}
          className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-sm transition-all ${
            categoryDropdownOpen
              ? "border-burgundy bg-white ring-2 ring-burgundy/15"
              : "border-gray-200 bg-gray-50/80 hover:border-burgundy/50"
          } ${categoriesLoading ? "pointer-events-none opacity-60" : ""}`}
        >
          {categoriesLoading ? (
            <span className="animate-pulse text-xs text-gray-400">...</span>
          ) : (
            <span className="truncate text-start font-medium text-gray-900">{selectedCategory?.name ?? ""}</span>
          )}
          <ChevronDown
            className={`h-4 w-4 flex-shrink-0 text-burgundy transition-transform duration-200 ${categoryDropdownOpen ? "rotate-180" : ""}`}
          />
        </button>

        {/* Opens upward — keeps the menu over the slide image instead of pushing the page. */}
        {categoryDropdownOpen && !categoriesLoading && (
          <div className="absolute bottom-full z-50 mb-2 w-full overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl">
            <div className="max-h-48 divide-y divide-gray-50 overflow-y-auto">
              {categories.map((cat) => {
                const isSelected = cat.id === selectedCategoryId;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    dir={locale === "ar" ? "rtl" : "ltr"}
                    onClick={() => { setSelectedCategoryId(cat.id); setCategoryDropdownOpen(false); }}
                    className={`flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-start text-sm transition-colors ${
                      isSelected
                        ? "bg-burgundy/[0.07] font-semibold text-burgundy"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span className="truncate">{cat.name}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 flex-shrink-0 text-burgundy" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Quick amounts */}
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-gray-400">{t("amountLabel")}</label>
      <div className="grid grid-cols-3 gap-2">
        {quickAmounts.map((amount) => (
          <button
            key={amount}
            type="button"
            onClick={() => { setSelectedAmount(amount); setCustomAmount(""); }}
            dir="ltr"
            className={`shape-chip border py-2 text-sm font-bold transition-all ${
              selectedAmount === amount
                ? "border-burgundy bg-burgundy text-white shadow-soft"
                : "border-gray-200 bg-white text-gray-700 hover:border-burgundy/50 hover:text-burgundy"
            }`}
          >
            {amount} <span className="text-[11px] font-semibold opacity-80">{currencyLabel}</span>
          </button>
        ))}
      </div>

      {/* Custom amount */}
      <div className="mt-3">
        <div className="relative">
          <input
            type="number"
            value={customAmount}
            onChange={(e) => { setCustomAmount(e.target.value); setSelectedAmount(null); }}
            placeholder={tQuick("enterAmount")}
            className={`w-full rounded-xl border border-gray-200 bg-gray-50/80 py-3 text-sm font-medium text-gray-900 transition-all focus:border-burgundy focus:bg-white focus:outline-none focus:ring-2 focus:ring-burgundy/15 ${locale === "ar" ? "pl-12 pr-3.5" : "pl-3.5 pr-12"}`}
          />
          <span className={`absolute top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400 ${locale === "ar" ? "left-3.5" : "right-3.5"}`}>{currencyLabel}</span>
        </div>
      </div>

      {/* Stripe minimum hint */}
      {belowMin && (
        <p className="mt-2 animate-fade-in text-center text-xs font-medium text-amber-600">
          {tDonation("stripeMinDonation", { amount: stripeMinAmount, currency: currencyLabel })}
        </p>
      )}

      {/* CTA */}
      <button
        onClick={handleDonateClick}
        disabled={!selectedCategoryId || displayAmount <= 0 || categoriesLoading || belowMin}
        className="shape-button group mt-4 flex w-full items-center justify-center gap-2 bg-burgundy px-5 py-3 text-sm font-bold text-white shadow-soft transition-all duration-300 hover:bg-burgundyDark hover:shadow-lift disabled:pointer-events-none disabled:opacity-50"
      >
        {t("secureDonate")}
        <Heart className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" fill="currentColor" />
      </button>

      {/* Trust */}
      <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
        <span>{tQuick("secureTransactions")}</span>
      </div>

      {donationDialogMounted && (
        <DonationDialog
          isOpen={donationDialogOpen}
          onClose={() => {
            setDonationDialogOpen(false);
            setResumeAmount(undefined);
            setResumeCategoryId("");
            setResumeCategoryName("");
            setResumeCategoryImage(undefined);
          }}
          categoryId={resumeCategoryId || selectedCategoryId}
          categoryName={resumeCategoryName || (selectedCategory?.name ?? "")}
          categoryImage={resumeCategoryImage ?? selectedCategory?.image ?? undefined}
          initialDonationAmount={resumeAmount ?? (displayAmount > 0 ? displayAmount : undefined)}
          authCallbackUrl={
            typeof window !== "undefined"
              ? appendCurrencyQuery(
                  `${pathname}?openHeroDonation=1#hero_quick_donate`,
                  getCurrencyCodeForLinks()
                )
              : undefined
          }
          onAuthCheckpoint={storeResume}
        />
      )}
    </div>
  );
};

export default HeroQuickDonate;
