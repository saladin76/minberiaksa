"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import axios from "axios";
import { Search, HandHeart, ArrowRight, X, ChevronDown, ChevronRight, Check } from "lucide-react";
import CampaignCard from "@/app/[locale]/_components/CampaignCard";
import { useDebounce } from "use-debounce";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import CategoryIcon from "@/components/CategoryIcon";

interface Campaign {
  id: string;
  slug?: string | null;
  baseSlug?: string | null;
  images: string[];
  title: string;
  description: string;
  currentAmount: number;
  targetAmount: number;
  videoUrl?: string | null;
  progress?: number;
  showProgress?: boolean;
  goalType?: string;
  fundraisingMode?: string;
  sharePriceUSD?: number | null;
  suggestedShareCounts?: { counts: number[]; priceByCurrency?: Record<string, number> } | null;
  suggestedDonations?: import("@/lib/campaign/suggested-donations").SuggestedDonationsConfig | null;
  isActive?: boolean;
  // Many-to-many: a campaign can belong to multiple categories. `categoryId`
  // is kept as a single-value alias (first category) for legacy code paths.
  categoryId?: string;
  categoryIds?: string[];
  category?: { id?: string; slug?: string | null; name?: string; icon?: string | null } | null;
  categories?: { id?: string; slug?: string | null; name?: string; icon?: string | null }[];
  createdAt: string;
  updatedAt?: string;
  // Admin-set ordering fields. Lower number = higher priority. null = unprioritized.
  priority?: number | null;
  categoryPriority?: number | null;
}

interface Category {
  id: string;
  slug?: string | null;
  baseSlug?: string | null;
  name: string;
  icon?: string | null;
  campaignCount?: number;
}

interface FilterState {
  sortBy: string;
  minAmount: number;
  maxAmount: number;
}

interface CampaignsPageContentProps {
  initialCampaigns?: Campaign[];
  initialCategories?: Category[];
  initialCursor?: string | null;
  initialHasMore?: boolean;
  initialTotal?: number;
}

const CampaignsPage = ({
  initialCampaigns = [],
  initialCategories = [],
  initialHasMore = false,
  initialTotal = initialCampaigns.length,
}: CampaignsPageContentProps = {}) => {
  const t = useTranslations("CampaignsPage");
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [loading, setLoading] = useState(initialCampaigns.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch] = useDebounce(searchQuery, 300);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [filters, setFilters] = useState<FilterState>({ sortBy: "newest", minAmount: 0, maxAmount: 100000000 });
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshingList, setIsRefreshingList] = useState(false);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const didHydrateRef = useRef(false);
  const requestSeqRef = useRef(0);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const ITEMS_PER_PAGE = 6;
  const locale = useLocale() as string;
  const isRTL = locale === "ar";

  const fetchData = useCallback(async (pageToLoad = 1) => {
    const requestId = ++requestSeqRef.current;
    const isFirstPage = pageToLoad === 1;
    try {
      setError(null);
      if (isFirstPage) {
        setIsRefreshingList(true);
      } else {
        setIsLoadingMore(true);
      }
      const getCampaignsPage = async (pageNumber: number) =>
        selectedCategory !== "all"
          ? axios.get(`/api/categories/${selectedCategory}/campaigns`, {
              params: { page: pageNumber, limit: ITEMS_PER_PAGE, search: debouncedSearch, locale, ...filters },
            })
          : axios.get("/api/campaigns", {
              params: { page: pageNumber, limit: ITEMS_PER_PAGE, search: debouncedSearch, locale, ...filters },
            });

      const categoriesPromise = !categories.length
        ? axios.get("/api/categories", { params: { locale, counts: true, activeCounts: true, limit: 100 } })
        : Promise.resolve({ data: { items: [] } });

      const [campaignsRes, categoriesRes] = await Promise.all([getCampaignsPage(pageToLoad), categoriesPromise]);
      if (requestId !== requestSeqRef.current) return;
      const campaignsItems = campaignsRes.data.items || campaignsRes.data;
      const newCampaigns = (campaignsItems as Campaign[]).map((campaign) => {
        // Many-to-many: collect all category ids the campaign belongs to.
        // Old API responses may only have `categoryId` / `category` — preserve
        // both shapes so the in-memory filter below works either way.
        const ids = Array.isArray(campaign.categoryIds) && campaign.categoryIds.length > 0
          ? campaign.categoryIds
          : (campaign.categoryId
              ? [campaign.categoryId]
              : campaign.category?.id
                ? [campaign.category.id]
                : selectedCategory !== "all"
                  ? [selectedCategory]
                  : []);
        return {
          ...campaign,
          categoryIds: ids,
          categoryId: ids[0],
          category: {
            ...(campaign.category ?? {}),
            id: campaign.category?.id || ids[0] || (selectedCategory !== "all" ? selectedCategory : ""),
          },
        };
      });
      if (pageToLoad > 1) {
        setCampaigns((prev) => {
          const seen = new Set(prev.map((campaign) => campaign.id));
          const merged = [...prev];
          for (const campaign of newCampaigns) {
            if (!seen.has(campaign.id)) {
              seen.add(campaign.id);
              merged.push(campaign);
            }
          }
          return merged;
        });
      } else {
        setCampaigns(newCampaigns);
      }
      setHasMore(Boolean(campaignsRes.data.hasMore));
      setPage(pageToLoad);
      setTotalCount(Number(campaignsRes.data.total) || newCampaigns.length);
      const catData = categoriesRes.data.items || categoriesRes.data;
      if (catData && !categories.length) setCategories(catData as Category[]);
    } catch (err) {
      if (requestId !== requestSeqRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      if (requestId !== requestSeqRef.current) return;
      setIsLoadingMore(false);
      setIsRefreshingList(false);
      setLoading(false);
    }
  }, [categories.length, debouncedSearch, filters, locale, selectedCategory]);

  useEffect(() => {
    // Skip first run: initial data was provided by the server render.
    if (!didHydrateRef.current) {
      didHydrateRef.current = true;
      // If the server returned nothing (empty DB / error), still do a client fetch so the page isn't empty.
      if (initialCampaigns.length === 0) {
        setPage(1);
        setHasMore(true);
        fetchData(1);
      }
      return;
    }
    setPage(1);
    setHasMore(true);
    fetchData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, selectedCategory, debouncedSearch, locale, initialCampaigns.length]);

  const loadMore = useCallback(() => {
    if (!isRefreshingList && !isLoadingMore && hasMore) fetchData(page + 1);
  }, [fetchData, hasMore, isLoadingMore, isRefreshingList, page]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMore || isLoadingMore || isRefreshingList || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "250px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, isRefreshingList, loadMore, loading]);

  const filteredCampaigns = useMemo(() => campaigns.filter((c) => {
    if (isRefreshingList) return c.isActive !== false;
    const matchesSearch = (c.title || "").toLowerCase().includes(searchQuery.toLowerCase()) || (c.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    // Many-to-many membership: any of the campaign's categories matches.
    const ids = c.categoryIds ?? (c.categoryId ? [c.categoryId] : c.category?.id ? [c.category.id] : []);
    const matchesCategory = selectedCategory === "all" || ids.includes(selectedCategory);
    const normalizedTarget = Number(c.targetAmount ?? 0);
    const matchesAmount = normalizedTarget >= filters.minAmount && normalizedTarget <= filters.maxAmount;
    return matchesSearch && matchesCategory && matchesAmount && c.isActive !== false;
  }), [campaigns, filters.maxAmount, filters.minAmount, isRefreshingList, searchQuery, selectedCategory]);

  const sortedCampaigns = useMemo(() => [...filteredCampaigns].sort((a, b) => {
    switch (filters.sortBy) {
      case "amount-high": return b.targetAmount - a.targetAmount;
      case "amount-low": return a.targetAmount - b.targetAmount;
      case "progress": return (b.currentAmount / b.targetAmount) - (a.currentAmount / a.targetAmount);
      default: {
        // Mirror the server's default ordering so admin-set priority isn't clobbered on
        // hydration. When a single category is selected we honor `categoryPriority` first
        // (the per-category reorder dialog writes this), then global `priority`, then newest.
        const aCat = !isRefreshingList && selectedCategory !== "all" ? a.categoryPriority ?? null : null;
        const bCat = !isRefreshingList && selectedCategory !== "all" ? b.categoryPriority ?? null : null;
        if (aCat !== null && bCat !== null && aCat !== bCat) return aCat - bCat;
        if (aCat !== null && bCat === null) return -1;
        if (aCat === null && bCat !== null) return 1;
        const ap = a.priority ?? null;
        const bp = b.priority ?? null;
        if (ap !== null && bp !== null && ap !== bp) return ap - bp;
        if (ap !== null && bp === null) return -1;
        if (ap === null && bp !== null) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    }
  }), [filteredCampaigns, filters.sortBy, isRefreshingList, selectedCategory]);

  const handleFilterChange = (key: keyof FilterState, value: number | string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleCategoryChange = (categoryId: string) => {
    if (categoryId === selectedCategory) return;
    setSelectedCategory(categoryId);
  };

  const hasActiveFilters = filters.sortBy !== "newest" || filters.minAmount !== 0 || filters.maxAmount !== 100000000;
  const resultCountLabel = totalCount > sortedCampaigns.length
    ? `${sortedCampaigns.length} / ${totalCount}`
    : String(sortedCampaigns.length);
  const showEmptyState = sortedCampaigns.length === 0 && !isLoadingMore && !isRefreshingList;

  if (loading) return <LoadingSkeleton />;

  if (error && sortedCampaigns.length === 0 && !isRefreshingList) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-offwhite">
        <div className="text-center bg-white shape-card p-10 shadow-soft max-w-sm mx-4">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <X className="w-7 h-7 text-red-400" />
          </div>
          <p className="text-deep font-semibold mb-1">{t("errorTitle") || "Something went wrong"}</p>
          <p className="text-gray-400 text-sm mb-6">{error}</p>
          <button
            onClick={() => fetchData(1)}
            className="shape-button bg-burgundy hover:bg-burgundyDark text-white px-6 py-2.5 text-sm font-semibold transition-colors"
          >
            {t("retry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-offwhite" dir={isRTL ? "rtl" : "ltr"}>
      {/* ── Hero Header ── */}
      <section className="relative hero-pattern text-white overflow-hidden">
        <div className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pt-10 pb-16 grid gap-10 md:grid-cols-[1fr_420px] md:items-center">
          <div>
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-ice/70 text-xs mb-8">
              <Link href="/" className="hover:text-white transition-colors">{t("home") || "Home"}</Link>
              <ChevronRight className={`w-3 h-3 ${isRTL ? "rotate-180" : ""}`} />
              <span className="text-white/90 font-medium">{t("campaigns") || "Campaigns"}</span>
            </div>

            <div className="gold-mark mb-6" />
            <h1 className="text-4xl sm:text-5xl font-extrabold text-white leading-tight">
              {t("campaigns") || "Projeler"}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-ice">
              {t("heroDescription") || "Support meaningful causes and make a lasting difference in people's lives."}
            </p>
          </div>

          {/* Info aside card — desktop only. On phones it pushed the categories bar
              a full screen down without adding anything the hero doesn't already say. */}
          <aside className="hidden md:block shape-card border border-white/15 bg-white/10 p-8 backdrop-blur">
            <div className="gold-mark" />
            <div className="mt-8 flex items-center justify-between gap-6">
              <div>
                <h2 className="text-2xl font-extrabold leading-tight">{t("categoryHubTitle")}</h2>
                <p className="mt-2 text-sm font-medium text-white/70">{t("categoryHubSubtitle")}</p>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold text-deep">
                <Check className="w-6 h-6" strokeWidth={3} />
              </div>
            </div>
            <p className="mt-6 text-sm font-medium text-white/75">{t("publicBenefitAssociation")}</p>
          </aside>
        </div>
      </section>

      {/* ── Categories bar ── */}
      <section className="max-w-7xl mx-auto px-4 lg:px-8 -mt-8 relative z-30">
        <div className="shape-card flex items-center gap-3 bg-white p-3 shadow-lift md:gap-5 md:p-5">
          <div className="shape-chip w-fit bg-deep px-4 py-2.5 text-xs font-extrabold text-white flex-shrink-0 md:px-7 md:py-3.5 md:text-sm">
            {t("categoriesLabel")}
          </div>

          {/* Phones get a dropdown instead of the chip row. The row scrolled
              horizontally with no affordance, so most categories were simply never
              discovered — a closed control that names the current filter is honest
              about there being more behind it. */}
          <div className="min-w-0 flex-1 md:hidden">
            <CategorySelect
              categories={categories}
              selectedCategory={selectedCategory}
              onSelect={handleCategoryChange}
              allLabel={t("allCampaigns") || "All"}
              isRTL={isRTL}
            />
          </div>

          <div className="hidden md:flex md:flex-wrap md:items-center md:gap-2.5">
            <button
              onClick={() => handleCategoryChange("all")}
              className={`shape-chip flex items-center gap-1.5 px-4 py-2 text-xs font-semibold transition-all whitespace-nowrap flex-shrink-0 border ${
                selectedCategory === "all"
                  ? "bg-burgundy text-white border-burgundy shadow-soft"
                  : "bg-white text-ink border-gray-200 hover:border-burgundy/50 hover:text-burgundy"
              }`}
            >
              <HandHeart className="w-3.5 h-3.5" />
              {t("allCampaigns") || "All"}
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                dir={isRTL ? "rtl" : "ltr"}
                onClick={() => handleCategoryChange(cat.id)}
                className={`shape-chip flex items-center gap-1.5 px-4 py-2 text-xs font-semibold transition-all whitespace-nowrap flex-shrink-0 border ${
                  selectedCategory === cat.id
                    ? "bg-burgundy text-white border-burgundy shadow-soft"
                    : "bg-white text-ink border-gray-200 hover:border-burgundy/50 hover:text-burgundy"
                }`}
              >
                {cat.campaignCount != null && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 ${selectedCategory === cat.id ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>
                    {cat.campaignCount}
                  </span>
                )}
                <CategoryIcon name={cat.icon} className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Sidebar + Grid ── */}
      <section className="max-w-7xl mx-auto px-4 lg:px-8 py-10 grid gap-8 lg:gap-10 md:grid-cols-[260px_1fr]">
        {/* Filter sidebar */}
        <aside className="h-fit md:sticky md:top-24">
          <div className="shape-card bg-white p-6 shadow-soft">
            <div className="shape-chip w-fit bg-burgundy px-6 py-3 text-sm font-extrabold text-white">
              {t("filterTitle")}
            </div>

            <div className="mt-6 space-y-7">
              {/* Search */}
              <div>
                <label className="mb-3 block text-sm font-extrabold text-deep">{t("searchLabel")}</label>
                <div className="relative">
                  <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 ${isRTL ? "right-3" : "left-3"}`} />
                  <input
                    type="search"
                    placeholder={t("searchPlaceholder") || "Search campaigns..."}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`h-11 w-full ${isRTL ? "pr-9 pl-3" : "pl-9 pr-3"} rounded-lg border border-gray-200 text-sm text-ink outline-none transition focus:border-burgundy focus:ring-2 focus:ring-burgundy/10`}
                  />
                </div>
              </div>

              {/* Sort */}
              <div>
                <p className="mb-3 text-sm font-extrabold text-deep">{t("sortBy") || "Sort by"}</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "newest", label: t("newest") || "Newest" },
                    { value: "amount-high", label: t("amountHigh") || "Highest" },
                    { value: "amount-low", label: t("amountLow") || "Lowest" },
                    { value: "progress", label: t("progress") || "Progress" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleFilterChange("sortBy", opt.value)}
                      className={`shape-chip px-3 py-2 text-xs font-semibold border transition-colors ${filters.sortBy === opt.value ? "bg-burgundy text-white border-burgundy" : "bg-white text-gray-600 border-gray-200 hover:border-burgundy/50"}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount range */}
              <div>
                <p className="mb-3 text-sm font-extrabold text-deep">{t("targetAmountRange") || "Target amount"}</p>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 mb-1 block">{t("minAmount") || "Min"}</label>
                    <input
                      type="number"
                      value={filters.minAmount}
                      onChange={(e) => handleFilterChange("minAmount", Number(e.target.value))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-burgundy focus:ring-2 focus:ring-burgundy/10 outline-none transition-all"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 mb-1 block">{t("maxAmount") || "Max"}</label>
                    <input
                      type="number"
                      value={filters.maxAmount}
                      onChange={(e) => handleFilterChange("maxAmount", Number(e.target.value))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-burgundy focus:ring-2 focus:ring-burgundy/10 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={() => { setFilters({ sortBy: "newest", minAmount: 0, maxAmount: 100000000 }); setSearchQuery(""); }}
                className="shape-chip w-full bg-offwhite py-3 text-sm font-extrabold text-deep border border-gray-200 transition-colors hover:bg-gray-50"
              >
                {hasActiveFilters || searchQuery ? (t("resetFilters") || "Reset") : (t("applyFilters") || "Apply filters")}
              </button>
            </div>
          </div>
        </aside>

        {/* Results column */}
        <div>
          <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-deep">{t("allCampaigns") || "All projects"}</h2>
              <p className="mt-2 text-sm font-medium text-gray-500">
                <span className="font-semibold text-gray-800">{isRefreshingList ? "..." : resultCountLabel}</span>{" "}
                {t("resultsFound") || "projects found"}
              </p>
            </div>

            <select
              value={filters.sortBy}
              onChange={(e) => handleFilterChange("sortBy", e.target.value)}
              className="shape-chip h-11 w-full border border-gray-200 bg-white px-4 text-sm font-semibold text-deep outline-none sm:w-[200px]"
            >
              <option value="newest">{t("newest") || "Newest"}</option>
              <option value="amount-high">{t("amountHigh") || "Highest"}</option>
              <option value="amount-low">{t("amountLow") || "Lowest"}</option>
              <option value="progress">{t("progress") || "Progress"}</option>
            </select>
          </div>

          {error && sortedCampaigns.length > 0 && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {t("errorTitle") || "Something went wrong"}. {t("retry") || "Try again"}
            </div>
          )}

          {isRefreshingList && (
            <div className="mb-5 shape-card border border-gray-100 bg-white px-4 py-3 text-sm font-semibold text-burgundy shadow-soft">
              {t("loading") || "Loading campaigns..."}
            </div>
          )}

          {showEmptyState ? (
            <div className="text-center py-20">
              <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <HandHeart className="w-9 h-9 text-gray-300" />
              </div>
              <h3 className="text-lg font-bold text-gray-700 mb-1">
                {searchQuery ? t("noResults") : t("noCampaigns")}
              </h3>
              <p className="text-gray-400 text-sm">
                {searchQuery ? t("tryDifferentSearch") : t("checkBackLater")}
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="mt-4 text-burgundy text-sm font-semibold hover:underline"
                >
                  {t("clearSearch") || "Clear search"}
                </button>
              )}
            </div>
          ) : (
            <div className="relative">
              <div className={`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 transition-opacity ${isRefreshingList ? "opacity-50" : "opacity-100"}`}>
                {sortedCampaigns.map((campaign) => (
                  <CampaignCard key={campaign.id} campaign={campaign} />
                ))}
                {isLoadingMore && sortedCampaigns.length > 0 && Array.from({ length: 3 }).map((_, i) => (
                  <CardSkeleton key={`more-${i}`} />
                ))}
              </div>
              {isRefreshingList && sortedCampaigns.length === 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                  {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={`refresh-${i}`} />)}
                </div>
              )}
            </div>
          )}

          {hasMore && sortedCampaigns.length > 0 && !isRefreshingList && (
            <div ref={loadMoreRef} className="h-1" aria-hidden="true" />
          )}

          {hasMore && !isLoadingMore && !isRefreshingList && sortedCampaigns.length > 0 && (
            <div className="text-center mt-12">
              <button
                onClick={loadMore}
                className="shape-button inline-flex items-center gap-2 bg-burgundy hover:bg-burgundyDark text-white font-semibold px-8 py-3 transition-all shadow-soft hover:shadow-lift hover:-translate-y-0.5"
              >
                {t("loadMore") || "Load More"}
                <ArrowRight className={`w-4 h-4 ${isRTL ? "rotate-180" : ""}`} />
              </button>
            </div>
          )}

          {isLoadingMore && sortedCampaigns.length === 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
            </div>
          )}
        </div>
      </section>

      {/* ── General donation CTA ── */}
      <section className="bg-deep text-white">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="max-w-xl text-2xl sm:text-3xl font-extrabold leading-tight">{t("ctaTitle")}</h2>
            <p className="mt-2 text-sm font-medium text-white/65">{t("ctaSubtitle")}</p>
          </div>
          <Link
            href="/"
            className="shape-button inline-flex w-fit items-center justify-center bg-burgundy hover:bg-burgundyDark px-10 py-4 text-sm font-extrabold text-white transition-colors"
          >
            {t("ctaButton")}
          </Link>
        </div>
      </section>
    </main>
  );
};

/* ── Category picker (phones) ──
   A select-only combobox rather than a native <select>, so each option can carry
   its icon and campaign count the way the desktop chips do. Keyboard and ARIA
   follow the listbox pattern: focus stays on the button and aria-activedescendant
   points at the highlighted option. */
interface CategorySelectProps {
  categories: Category[];
  selectedCategory: string;
  onSelect: (id: string) => void;
  allLabel: string;
  isRTL: boolean;
}

const CategorySelect = ({
  categories,
  selectedCategory,
  onSelect,
  allLabel,
  isRTL,
}: CategorySelectProps) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const listId = useId();

  const options = useMemo(
    () => [{ id: "all", name: allLabel, icon: null as string | null, campaignCount: undefined as number | undefined }, ...categories],
    [categories, allLabel]
  );
  const selectedIndex = Math.max(0, options.findIndex((o) => o.id === selectedCategory));
  const selected = options[selectedIndex] ?? options[0];

  // Open on the current selection so the first arrow press moves from where the
  // user actually is rather than from the top of the list.
  useEffect(() => {
    if (open) setActiveIndex(selectedIndex);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the highlighted option in view while arrowing through a long list.
  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const commit = (index: number) => {
    const option = options[index];
    if (option) onSelect(option.id);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (!open) return;
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(activeIndex);
    }
  };

  return (
    <div ref={rootRef} className="relative" onKeyDown={handleKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        onClick={() => setOpen((v) => !v)}
        className="shape-chip flex w-full items-center gap-2 border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-ink transition-colors hover:border-burgundy/50"
      >
        {selected.id === "all" ? (
          <HandHeart className="h-4 w-4 flex-shrink-0 text-burgundy" />
        ) : (
          <CategoryIcon name={selected.icon} className="h-4 w-4 flex-shrink-0 text-burgundy" />
        )}
        <span className="min-w-0 flex-1 truncate text-start">{selected.name}</span>
        {selected.campaignCount != null && (
          <span className="flex-shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-500">
            {selected.campaignCount}
          </span>
        )}
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={allLabel}
          dir={isRTL ? "rtl" : "ltr"}
          className="absolute inset-x-0 top-full z-50 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-gray-100 bg-white p-1.5 shadow-lift"
        >
          {options.map((option, index) => {
            const isSelected = option.id === selectedCategory;
            const isActive = index === activeIndex;
            return (
              <li
                key={option.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={isSelected}
                data-active={isActive}
                onPointerEnter={() => setActiveIndex(index)}
                onClick={() => commit(index)}
                className={`flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors ${
                  isSelected
                    ? "bg-burgundy text-white"
                    : isActive
                      ? "bg-burgundy/8 text-burgundy"
                      : "text-ink"
                }`}
              >
                {option.id === "all" ? (
                  <HandHeart className="h-4 w-4 flex-shrink-0" />
                ) : (
                  <CategoryIcon name={option.icon} className="h-4 w-4 flex-shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate">{option.name}</span>
                {option.campaignCount != null && (
                  <span
                    className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      isSelected ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {option.campaignCount}
                  </span>
                )}
                {isSelected && <Check className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={3} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

/* ── Skeleton card ── */
const CardSkeleton = () => (
  <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
    <div className="relative h-52 bg-gray-100 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-[shimmer_1.4s_infinite] -translate-x-full" />
    </div>
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded-full bg-gray-100 animate-pulse" />
        <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
      </div>
      <div className="h-4 bg-gray-100 rounded animate-pulse w-4/5" />
      <div className="h-3 bg-gray-100 rounded animate-pulse w-full" />
      <div className="h-3 bg-gray-100 rounded animate-pulse w-3/5" />
      <div className="h-2 bg-gray-100 rounded-full animate-pulse mt-2" />
      <div className="flex justify-between pt-1">
        <div className="h-3 w-16 bg-gray-100 rounded animate-pulse" />
        <div className="h-3 w-12 bg-gray-100 rounded animate-pulse" />
      </div>
      <div className="h-9 bg-gray-100 rounded-lg animate-pulse mt-1" />
    </div>
  </div>
);

/* ── Full page loading skeleton ── */
const LoadingSkeleton = () => (
  <div className="min-h-screen bg-gray-50">
    {/* Hero skeleton */}
    <div className="relative h-64 hero-pattern overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[shimmer_1.8s_infinite] -translate-x-full" />
      <div className="relative z-10 flex flex-col items-center justify-center h-full gap-3 px-4">
        <div className="h-3 w-28 bg-white/20 rounded-full animate-pulse" />
        <div className="h-8 w-64 bg-white/20 rounded-xl animate-pulse" />
        <div className="h-3 w-48 bg-white/15 rounded animate-pulse" />
        <div className="h-11 w-full max-w-lg bg-white/20 rounded-2xl animate-pulse mt-4" />
      </div>
    </div>
    {/* Tabs skeleton */}
    <div className="bg-white border-b border-gray-100 px-4 py-3 flex gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-8 w-20 bg-gray-100 rounded-full animate-pulse flex-shrink-0" />
      ))}
    </div>
    {/* Grid skeleton */}
    <div className="max-w-7xl mx-auto px-4 py-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
    </div>
  </div>
);

export default CampaignsPage;
