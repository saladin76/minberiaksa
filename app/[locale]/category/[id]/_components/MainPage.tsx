"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import axios from "axios";
import { Search, HandHeart, ChevronRight, X, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/routing";
import CampaignCard from "@/app/[locale]/_components/CampaignCard";
import { useLocale, useTranslations } from "next-intl";

interface Campaign {
  id: string;
  images: string[];
  title: string;
  description: string;
  currentAmount: number;
  targetAmount: number;
  progress?: number;
  showProgress?: boolean;
  fundraisingMode?: string;
  isActive?: boolean;
  categoryId?: string;
  category: { id?: string; name: string; icon?: string };
  createdAt: string;
}

interface Category {
  id: string;
  name: string;
  description: string;
  image: string;
}

const FALLBACK_IMAGE = "https://i.ibb.co/N2zVsqfg/calisma-alanlarimiz-egitim-sektoru.jpg";

const MainPage = ({ id, locale: localeProp }: { id: string; locale?: string }) => {
  const t = useTranslations("CampaignsPage");
  const locale = useLocale();
  const isRTL = locale === "ar";

  const [category, setCategory] = useState<Category | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  const effectiveLocale = localeProp || locale;

  const fetchData = async (cursorParam?: string | null) => {
    try {
      setIsLoadingMore(true);
      const [categoryRes, campaignsRes] = await Promise.all([
        !category
          ? axios.get(`/api/categories/${id}?locale=${effectiveLocale}&counts=true`)
          : Promise.resolve({ data: category }),
        axios.get(`/api/categories/${id}/campaigns`, {
          params: { locale: effectiveLocale, limit: 12, cursor: cursorParam },
        }),
      ]);
      if (!category) setCategory(categoryRes.data);
      const newCampaigns = (campaignsRes.data.items || []).map((c: Campaign) => ({
        ...c,
        categoryId: c.categoryId || id,
        category: { ...c.category, id: c.category?.id || id },
      }));
      if (cursorParam) {
        setCampaigns((prev) => [...prev, ...newCampaigns]);
      } else {
        setCampaigns(newCampaigns);
      }
      setHasMore(Boolean(campaignsRes.data.hasMore));
      setCursor(campaignsRes.data.nextCursor || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoadingMore(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, effectiveLocale]);

  const filteredCampaigns = campaigns.filter(
    (c) =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) return <LoadingSkeleton />;

  if (error || !category) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center bg-white rounded-2xl p-10 shadow-sm border border-gray-100 max-w-sm mx-4">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <X className="w-7 h-7 text-red-400" />
          </div>
          <p className="text-gray-700 font-semibold mb-1">{t("error") || "Something went wrong"}</p>
          <p className="text-gray-400 text-sm mb-6">{error || t("noCampaigns")}</p>
          <Link
            href="/"
            className="bg-[#A5243D] hover:bg-[#7D1830] text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors inline-block"
          >
            {t("home") || "Home"}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50" dir={isRTL ? "rtl" : "ltr"}>

      {/* ── Hero Header ── */}
      <section className="relative">
        {/* Background layers */}
        <div className="absolute inset-0">
          <Image src={category.image || FALLBACK_IMAGE} alt="" aria-hidden fill priority sizes="100vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-deep/80 via-deep/70 to-deep/90" />
          <div className="absolute inset-0 bg-burgundy/25" />
          <div className="absolute inset-0 opacity-[0.04] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:20px_20px]" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 pt-12 pb-20">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-white/60 text-xs mb-6">
            <Link href="/" className="hover:text-white transition-colors">{t("home") || "Home"}</Link>
            <ChevronRight className={`w-3 h-3 flex-shrink-0 ${isRTL ? "rotate-180" : ""}`} />
            <Link href="/campaigns" className="hover:text-white transition-colors">{t("campaigns") || "Campaigns"}</Link>
            <ChevronRight className={`w-3 h-3 flex-shrink-0 ${isRTL ? "rotate-180" : ""}`} />
            <span className="text-white/90 font-medium">{category.name}</span>
          </div>

          {/* Title */}
          <div className="text-center max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 px-3 py-1.5 shape-chip text-xs font-semibold text-white/90 mb-4">
              <HandHeart className="w-3.5 h-3.5 text-gold" />
              <span>{t("projects") || "OUR PROJECTS"}</span>
            </div>
            <div className="gold-mark mx-auto mb-4" />
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-3">
              <span className="text-[#D8AA55]">{category.name}</span>
            </h1>
            {category.description && (
              <p className="text-white/70 text-sm sm:text-base leading-relaxed">
                {category.description}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── Sidebar + Grid ── */}
      <section className="max-w-7xl mx-auto px-4 lg:px-8 py-10 grid gap-8 lg:gap-10 md:grid-cols-[260px_1fr]">
        {/* Filter sidebar — search is the only available filter for a single category */}
        <aside className="h-fit md:sticky md:top-24">
          <div className="shape-card bg-white p-6 shadow-soft">
            <div className="shape-chip w-fit bg-burgundy px-6 py-3 text-sm font-extrabold text-white">
              {t("filterTitle")}
            </div>
            <div className="mt-6 space-y-7">
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
              <button
                onClick={() => setSearchQuery("")}
                disabled={!searchQuery}
                className="shape-chip w-full bg-offwhite py-3 text-sm font-extrabold text-deep border border-gray-200 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                {t("resetFilters") || "Reset"}
              </button>
            </div>
          </div>
        </aside>

        {/* Results column */}
        <div>
          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-deep">{category.name}</h2>
            {filteredCampaigns.length > 0 && (
              <p className="mt-2 text-sm font-medium text-gray-500">
                <span className="font-semibold text-gray-800">{filteredCampaigns.length}</span>{" "}
                {t("resultsFound") || "projects found"}
              </p>
            )}
          </div>

          {filteredCampaigns.length === 0 && !isLoadingMore ? (
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
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredCampaigns.map((campaign) => (
                <CampaignCard key={campaign.id} campaign={campaign} />
              ))}
              {isLoadingMore && Array.from({ length: 3 }).map((_, i) => (
                <CardSkeleton key={`more-${i}`} />
              ))}
            </div>
          )}

          {/* Load more */}
          {hasMore && !isLoadingMore && filteredCampaigns.length > 0 && (
            <div className="text-center mt-12">
              <button
                onClick={() => fetchData(cursor)}
                className="shape-button inline-flex items-center gap-2 bg-burgundy hover:bg-burgundyDark text-white font-semibold px-8 py-3 transition-all shadow-soft hover:shadow-lift hover:-translate-y-0.5"
              >
                {t("loadMore") || "Load More"}
                <ArrowRight className={`w-4 h-4 ${isRTL ? "rotate-180" : ""}`} />
              </button>
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

/* ── Skeleton card ── */
const CardSkeleton = () => (
  <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
    <div className="aspect-[4/3] bg-gray-100 animate-pulse" />
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
    <div className="relative h-64 bg-[#A5243D] overflow-hidden">
      <div className="relative z-10 flex flex-col items-center justify-center h-full gap-3 px-4">
        <div className="h-3 w-28 bg-white/20 rounded-full animate-pulse" />
        <div className="h-8 w-64 bg-white/20 rounded-xl animate-pulse" />
        <div className="h-3 w-48 bg-white/15 rounded animate-pulse" />
      </div>
    </div>
    {/* Sidebar + Grid skeleton */}
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-10 grid gap-8 lg:gap-10 md:grid-cols-[260px_1fr]">
      <div className="h-64 bg-white shape-card shadow-soft animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
      </div>
    </div>
  </div>
);

export default MainPage;
