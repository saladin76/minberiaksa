"use client";

import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Heart, CheckCircle, ChevronDown, Check, ShieldCheck, Utensils, Home, Stethoscope, Users, HeartHandshake, ArrowRight } from "lucide-react";
import { getCurrency } from "@/hooks/useCampaignValue";
import { usePathname, useRouter } from "@/i18n/routing";
import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/routing";
import { appendCurrencyQuery, getCurrencyCodeForLinks } from "@/lib/currency-link";
import type { SuggestedDonationsConfig } from "@/lib/campaign/suggested-donations";
import type { ShareLabelsConfig } from "@/lib/campaign/share-labels";

// DonationDialog pulls in @stripe/stripe-js (~230KiB) plus the Stripe utility script.
// Loading it lazily keeps Stripe out of the homepage critical path entirely.
const DonationDialog = dynamic(() => import("@/components/DonationDialog"), { ssr: false });

interface CategoryOption {
  id: string;
  name: string;
  image?: string | null;
}

/**
 * The subset of a campaign the donation dialog needs. Quick Donate now gives to a
 * specific campaign rather than to its category, so the amount presets, shares
 * config and goal type all have to travel with the selection.
 */
interface CampaignOption {
  id: string;
  title: string;
  images?: string[];
  targetAmount?: number;
  currentAmount?: number;
  goalType?: string;
  fundraisingMode?: string;
  sharePriceUSD?: number | null;
  suggestedShareCounts?: {
    counts: number[];
    priceByCurrency?: Record<string, number>;
  } | null;
  suggestedDonations?: SuggestedDonationsConfig | null;
  shareLabels?: ShareLabelsConfig | null;
}

interface QuickDonateProps {
  /** Server-fetched categories — when provided we skip the client fetch + loading state,
   *  which means the SSR HTML already contains the final dropdown content (no CLS). */
  initialCategories?: CategoryOption[];
}

const QUICK_DONATE_RESUME_KEY = "quickDonateResume";

const QuickDonate: React.FC<QuickDonateProps> = ({ initialCategories = [] }) => {
  const t = useTranslations("QuickDonate");
  const tDonation = useTranslations("DonationDialog");
  const locale = useLocale() as "ar" | "en" | "fr";
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
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
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignDropdownOpen, setCampaignDropdownOpen] = useState(false);
  const campaignDropdownRef = useRef<HTMLDivElement>(null);
  /** Set when the visitor picks a category themselves, so the project list only
   *  springs open on a deliberate change and never on first paint. */
  const autoOpenCampaignsRef = useRef(false);
  const [currencyLabel, setCurrencyLabel] = useState<string>("USD");
  const [stripeMinAmount, setStripeMinAmount] = useState(1);
  /** Campaign the visitor had picked before being sent to sign-in. */
  const pendingResumeCampaignRef = useRef<string>("");
  const [resumeRequested, setResumeRequested] = useState(false);

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

  // After sign-in redirect: restore the selection and re-open the dialog. The
  // dialog can't open here any more — it now needs a campaign, and campaigns are
  // fetched per category, so opening waits until that selection is back in place.
  useEffect(() => {
    if (searchParams.get("openDonation") !== "1") return;
    try {
      const stored = typeof window !== "undefined" ? sessionStorage.getItem(QUICK_DONATE_RESUME_KEY) : null;
      if (stored) {
        const data = JSON.parse(stored) as { categoryId?: string; campaignId?: string; amount?: number };
        if (data.categoryId) setSelectedCategoryId(data.categoryId);
        if (data.campaignId) pendingResumeCampaignRef.current = data.campaignId;
        if (typeof data.amount === "number" && data.amount > 0) setSelectedAmount(data.amount);
        sessionStorage.removeItem(QUICK_DONATE_RESUME_KEY);
      }
    } catch {
      /* ignore */
    }
    setResumeRequested(true);
    router.replace(
      appendCurrencyQuery(`${pathname}#quick_donate`, getCurrencyCodeForLinks())
    );
  }, [searchParams, pathname, router]);

  // Close either dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(target)) {
        setCategoryDropdownOpen(false);
      }
      if (campaignDropdownRef.current && !campaignDropdownRef.current.contains(target)) {
        setCampaignDropdownOpen(false);
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
        if (items.length > 0 && !selectedCategoryId) {
          setSelectedCategoryId(items[0].id);
        }
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

  // Projects inside the chosen area. Refetched whenever the area changes, since
  // the gift now goes to one specific project rather than to the area as a whole.
  useEffect(() => {
    if (!selectedCategoryId) {
      setCampaigns([]);
      setSelectedCampaignId("");
      return;
    }
    let cancelled = false;
    setCampaignsLoading(true);
    setCampaigns([]);
    setSelectedCampaignId("");
    fetch(`/api/categories/${selectedCategoryId}/campaigns?locale=${locale}&limit=50`)
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => {
        if (cancelled) return;
        const items = (Array.isArray(data?.items) ? data.items : []) as CampaignOption[];
        setCampaigns(items);

        // Prefer the project the visitor had chosen before signing in; otherwise
        // preselect the first so the button is usable straight away.
        const wanted = pendingResumeCampaignRef.current;
        pendingResumeCampaignRef.current = "";
        const restored = wanted ? items.find((c) => c.id === wanted) : undefined;
        setSelectedCampaignId(restored?.id ?? items[0]?.id ?? "");
        // The saved project is gone (unpublished, or the area changed) — don't
        // silently reopen checkout on a different one, let them pick again.
        if (wanted && !restored) setResumeRequested(false);

        if (autoOpenCampaignsRef.current && items.length > 1) setCampaignDropdownOpen(true);
        autoOpenCampaignsRef.current = false;
      })
      .catch(() => {
        if (!cancelled) autoOpenCampaignsRef.current = false;
      })
      .finally(() => {
        if (!cancelled) setCampaignsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCategoryId, locale]);

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId);
  const displayAmount = selectedAmount ?? (customAmount ? parseFloat(customAmount) || 0 : 0);
  const belowMin = stripeMinAmount > 1 && displayAmount > 0 && displayAmount < stripeMinAmount;
  const canDonate =
    Boolean(selectedCampaignId) && displayAmount > 0 && !belowMin && !campaignsLoading;

  // Reopen checkout once the restored project is actually in hand.
  useEffect(() => {
    if (!resumeRequested || !selectedCampaignId) return;
    setResumeRequested(false);
    setDonationDialogMounted(true);
    setDonationDialogOpen(true);
  }, [resumeRequested, selectedCampaignId]);

  const storeQuickDonateResume = () => {
    if (!selectedCategoryId || !selectedCampaignId || displayAmount <= 0) return;
    if (typeof window === "undefined") return;
    sessionStorage.setItem(
      QUICK_DONATE_RESUME_KEY,
      JSON.stringify({
        categoryId: selectedCategoryId,
        campaignId: selectedCampaignId,
        amount: displayAmount,
      })
    );
  };

  const handleCategorySelect = (categoryId: string) => {
    setCategoryDropdownOpen(false);
    if (categoryId === selectedCategoryId) return;
    // Deliberate change — reveal the projects inside it rather than making the
    // visitor guess that a second choice is waiting.
    autoOpenCampaignsRef.current = true;
    setSelectedCategoryId(categoryId);
  };

  const handleDonateClick = () => {
    if (!canDonate) return;
    setDonationDialogMounted(true);
    setDonationDialogOpen(true);
  };

  const impacts = [
    { icon: Utensils, key: "impact1" as const },
    { icon: Home, key: "impact2" as const },
    { icon: Stethoscope, key: "impact3" as const },
  ];

  const stats = [
    { icon: Users, value: "500,000+", labelKey: "stat1" as const },
    { icon: HeartHandshake, value: "350+", labelKey: "stat2" as const },
    { icon: ShieldCheck, value: "100%", labelKey: "stat4" as const },
  ];

  const quickAmounts = [100, 200, 300, 400, 500, 1000];

  return (
    <div
      id="quick_donate"
      className="relative overflow-hidden bg-white shadow-soft lg:shadow-lift rounded-none lg:rounded-[32px_8px_32px_8px] rtl:lg:rounded-[8px_32px_8px_32px] lg:ring-1 lg:ring-deep/5"
    >
      <div className="grid lg:grid-cols-2">
        {/* ── Left: emotional photo panel ── */}
        <div className="relative min-h-[340px] lg:min-h-[600px]">
          <Image
            src="https://i0.wp.com/www.middleeastmonitor.com/wp-content/uploads/2022/08/AA-20220820-28691570-28691558-DAILY_LIFE_IN_GAZA.jpg?fit=920%2C613&ssl=1"
            alt=""
            aria-hidden
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-deep via-deep/65 to-deep/20" />
          <div className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:18px_18px]" />

          {/* Trust badge */}
          <div className="absolute top-5 start-5 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-sm ring-1 ring-white/25">
            <ShieldCheck className="h-3.5 w-3.5 text-gold" />
            {t("reassurance")}
          </div>

          {/* Emotional copy */}
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 p-6 text-white sm:p-8 lg:p-10">
            <span className="inline-flex w-fit items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-gold">
              <span className="h-px w-7 bg-gold" />
              {t("eyebrow")}
            </span>
            <h2 className="text-2xl font-semibold leading-[1.35] drop-shadow-sm sm:text-3xl sm:leading-[1.3] lg:text-[2.6rem] lg:leading-[1.25]">
              {t("heading")}
            </h2>
            <p className="max-w-md text-sm leading-[1.9] text-ice/90 sm:text-base">
              {t("description")}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {impacts.map(({ icon: Icon, key }) => (
                <span key={key} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.12] px-3 py-1.5 text-xs font-semibold backdrop-blur-sm ring-1 ring-white/20">
                  <Icon className="h-3.5 w-3.5 text-gold" />
                  {t(key)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: donation widget ── */}
        <div className="flex flex-col p-6 sm:p-8 lg:p-10">
          <div className="mb-5">
            <h3 className="text-xl font-extrabold leading-snug text-deep sm:text-2xl">{t("giveTitle")}</h3>
            <div className="gold-mark-sm mt-3" />
          </div>

          {/* Category */}
          <div ref={categoryDropdownRef} className="relative mb-4">
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-gray-400">{t("selectCategory")}</label>
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
              <ChevronDown className={`h-4 w-4 flex-shrink-0 text-burgundy transition-transform duration-200 ${categoryDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {categoryDropdownOpen && !categoriesLoading && (
              <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl">
                <div className="max-h-52 divide-y divide-gray-50 overflow-y-auto">
                  {categories.map((cat) => {
                    const isSelected = cat.id === selectedCategoryId;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        dir={locale === "ar" ? "rtl" : "ltr"}
                        onClick={() => handleCategorySelect(cat.id)}
                        className={`flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-start text-sm transition-colors ${
                          isSelected ? "bg-burgundy/[0.07] font-semibold text-burgundy" : "text-gray-700 hover:bg-gray-50"
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

          {/* Project inside the chosen area — the donation is credited here, not
              to the area, so it has to be an explicit choice. */}
          <div ref={campaignDropdownRef} className="relative mb-4">
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-gray-400">{t("selectProject")}</label>
            <button
              type="button"
              onClick={() =>
                !campaignsLoading && campaigns.length > 0 && setCampaignDropdownOpen((o) => !o)
              }
              dir={locale === "ar" ? "rtl" : "ltr"}
              className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-sm transition-all ${
                campaignDropdownOpen
                  ? "border-burgundy bg-white ring-2 ring-burgundy/15"
                  : "border-gray-200 bg-gray-50/80 hover:border-burgundy/50"
              } ${campaignsLoading || campaigns.length === 0 ? "pointer-events-none opacity-60" : ""}`}
            >
              {campaignsLoading ? (
                <span className="animate-pulse text-xs text-gray-400">...</span>
              ) : campaigns.length === 0 ? (
                <span className="truncate text-start text-xs font-medium text-gray-400">{t("noCampaigns")}</span>
              ) : (
                <span className="truncate text-start font-medium text-gray-900">{selectedCampaign?.title ?? ""}</span>
              )}
              <ChevronDown className={`h-4 w-4 flex-shrink-0 text-burgundy transition-transform duration-200 ${campaignDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {campaignDropdownOpen && !campaignsLoading && campaigns.length > 0 && (
              <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl">
                <div className="max-h-52 divide-y divide-gray-50 overflow-y-auto">
                  {campaigns.map((camp) => {
                    const isSelected = camp.id === selectedCampaignId;
                    return (
                      <button
                        key={camp.id}
                        type="button"
                        dir={locale === "ar" ? "rtl" : "ltr"}
                        onClick={() => { setSelectedCampaignId(camp.id); setCampaignDropdownOpen(false); }}
                        className={`flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-start text-sm transition-colors ${
                          isSelected ? "bg-burgundy/[0.07] font-semibold text-burgundy" : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <span className="truncate">{camp.title}</span>
                        {isSelected && <Check className="h-3.5 w-3.5 flex-shrink-0 text-burgundy" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Quick amounts */}
          <label className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-gray-400">{t("selectAmount")}</label>
          <div className="grid grid-cols-3 gap-2">
            {quickAmounts.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => { setSelectedAmount(amount); setCustomAmount(""); }}
                dir="ltr"
                className={`shape-chip border py-2.5 text-sm font-bold transition-all ${
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
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-gray-400">{t("customAmount")}</label>
            <div className="relative">
              <input
                type="number"
                value={customAmount}
                onChange={(e) => { setCustomAmount(e.target.value); setSelectedAmount(null); }}
                placeholder={t("enterAmount")}
                className={`w-full rounded-xl border border-gray-200 bg-gray-50/80 py-3 text-sm font-medium text-gray-900 transition-all focus:border-burgundy focus:bg-white focus:outline-none focus:ring-2 focus:ring-burgundy/15 ${locale === "ar" ? "pl-12 pr-3.5" : "pl-3.5 pr-12"}`}
              />
              <span className={`absolute top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400 ${locale === "ar" ? "left-3.5" : "right-3.5"}`}>{currencyLabel}</span>
            </div>
          </div>

          {/* Encouragement / Stripe minimum hint */}
          {belowMin ? (
            <p className="mt-3 animate-fade-in text-center text-xs font-medium text-amber-600">
              {tDonation("stripeMinDonation", { amount: stripeMinAmount, currency: currencyLabel })}
            </p>
          ) : displayAmount > 0 ? (
            <p className="mt-3 flex items-center gap-2 rounded-xl bg-burgundy/[0.06] px-3.5 py-2.5 text-xs font-medium leading-relaxed text-burgundy animate-fade-in">
              <Heart className="h-3.5 w-3.5 shrink-0" fill="currentColor" />
              {t("encourage", { amount: `${displayAmount} ${currencyLabel}` })}
            </p>
          ) : null}

          {/* CTA */}
          <button
            onClick={handleDonateClick}
            disabled={!canDonate || categoriesLoading}
            className="shape-button mt-5 flex w-full items-center justify-center gap-2 bg-burgundy py-3.5 text-base font-bold text-white shadow-soft transition-all duration-300 hover:bg-burgundyDark hover:shadow-lift disabled:pointer-events-none disabled:opacity-50"
          >
            <Heart className="h-4 w-4" fill="currentColor" />
            {t("donateNow")}
          </button>

          {/* Secure */}
          <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
            <CheckCircle className="h-3.5 w-3.5 text-green-500" />
            <span>{t("secureTransactions")}</span>
          </div>

          {/* Stats */}
          <div className="mt-auto grid grid-cols-3 gap-3 border-t border-gray-100 pt-5 sm:pt-6">
            {stats.map(({ icon: Icon, value, labelKey }) => (
              <div key={labelKey} className="text-center">
                <Icon className="mx-auto mb-1.5 h-4 w-4 text-burgundy" />
                <div className="text-base font-extrabold text-deep sm:text-lg">{value}</div>
                <div className="mt-0.5 text-[10px] leading-snug text-gray-400">{t(labelKey)}</div>
              </div>
            ))}
          </div>

          {/* Discover link */}
          <Link href="/about-us" className="mt-4 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-navy transition-colors hover:text-burgundy">
            {t("discoverMore")}
            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
          </Link>
        </div>
      </div>

      {donationDialogMounted && (
        <DonationDialog
          isOpen={donationDialogOpen}
          onClose={() => setDonationDialogOpen(false)}
          // No monthlyOnly: the dialog opens on its own first step so the visitor
          // chooses one-time or monthly instead of being committed to a
          // subscription they never asked for.
          campaignId={selectedCampaign?.id ?? ""}
          campaignTitle={selectedCampaign?.title ?? ""}
          campaignImage={selectedCampaign?.images?.[0] || undefined}
          targetAmount={selectedCampaign?.targetAmount ?? 0}
          amountRaised={selectedCampaign?.currentAmount ?? 0}
          goalType={selectedCampaign?.goalType}
          fundraisingMode={selectedCampaign?.fundraisingMode}
          sharePriceUSD={selectedCampaign?.sharePriceUSD ?? null}
          suggestedShareCounts={selectedCampaign?.suggestedShareCounts ?? null}
          suggestedDonations={selectedCampaign?.suggestedDonations ?? null}
          shareLabels={selectedCampaign?.shareLabels ?? null}
          initialDonationAmount={displayAmount > 0 ? displayAmount : undefined}
          authCallbackUrl={
            typeof window !== "undefined"
              ? appendCurrencyQuery(
                  `${pathname}?openDonation=1#quick_donate`,
                  getCurrencyCodeForLinks()
                )
              : undefined
          }
          onAuthCheckpoint={storeQuickDonateResume}
        />
      )}
    </div>
  );
};

export default QuickDonate;
