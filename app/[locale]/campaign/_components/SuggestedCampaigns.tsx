"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import CampaignCard, { type CampaignCardData } from "@/app/[locale]/_components/CampaignCard";
import CategoryIcon from "@/components/CategoryIcon";

interface SuggestedCampaignsProps {
  /** Category id (or slug) used by `/api/categories/[id]/campaigns`. */
  categoryId: string;
  /** Campaign currently being viewed — filtered out of the result list. */
  currentCampaignId: string;
  /** Localized category name (used in the heading + view-all link label). */
  categoryName?: string;
  /** Slug for the /category/[slug] link target; falls back to id. */
  categorySlug?: string | null;
  /** Lucide icon key stored on the category (see CategoryIcon). Falls back to Heart. */
  categoryIcon?: string | null;
  /** Override how many cards to show. Defaults to 8 — the responsive grid trims naturally. */
  limit?: number;
}

interface ApiCampaignItem {
  id: string;
  slug?: string | null;
  title: string;
  description: string;
  images: string[];
  targetAmount: number;
  currentAmount: number;
  progress?: number;
  showProgress?: boolean;
  goalType?: string;
  fundraisingMode?: string;
  sharePriceUSD?: number | null;
  suggestedShareCounts?: { counts: number[]; priceByCurrency?: Record<string, number> } | null;
  suggestedDonations?: CampaignCardData["suggestedDonations"];
  category?: { id?: string; slug?: string | null; name?: string; icon?: string | null } | null;
}

export default function SuggestedCampaigns({
  categoryId,
  currentCampaignId,
  categoryName,
  categorySlug,
  categoryIcon,
  limit = 8,
}: SuggestedCampaignsProps) {
  const locale = useLocale() as string;
  const t = useTranslations("Campaign");
  const isRTL = locale === "ar";

  const [items, setItems] = useState<CampaignCardData[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!categoryId) return;
    let cancelled = false;
    setLoading(true);
    axios
      .get(`/api/categories/${encodeURIComponent(categoryId)}/campaigns`, {
        params: { locale, limit: limit + 1 },
      })
      .then((res) => {
        if (cancelled) return;
        const raw = (res.data?.items ?? []) as ApiCampaignItem[];
        const filtered: CampaignCardData[] = raw
          .filter((c) => c.id !== currentCampaignId)
          .slice(0, limit)
          .map((c) => ({
            id: c.id,
            slug: c.slug ?? null,
            images: c.images ?? [],
            title: c.title,
            description: c.description,
            currentAmount: c.currentAmount ?? 0,
            targetAmount: c.targetAmount ?? 0,
            progress: c.progress,
            showProgress: c.showProgress,
            fundraisingMode: c.fundraisingMode,
            goalType: c.goalType,
            sharePriceUSD: c.sharePriceUSD ?? null,
            suggestedShareCounts: c.suggestedShareCounts ?? null,
            suggestedDonations: c.suggestedDonations ?? null,
            category: c.category ?? null,
          }));
        setItems(filtered);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [categoryId, currentCampaignId, locale, limit]);

  // Hide the section entirely when there's nothing else in the category — silent is better than empty.
  if (!loading && (items == null || items.length === 0)) return null;

  const categoryHref = `/category/${categorySlug || categoryId}`;
  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  return (
    <section
      aria-labelledby="suggested-campaigns-heading"
      className="bg-white sm:rounded-2xl overflow-hidden px-4 sm:px-6 lg:px-8 py-6 sm:py-8"
    >
      {/* Header */}
      <div className="flex items-start sm:items-center justify-between gap-4 mb-5 sm:mb-6 flex-col sm:flex-row">
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-[#A5243D] to-[#D8AA55] text-white flex items-center justify-center shadow-sm shadow-[#D8AA55]/30">
            <CategoryIcon name={categoryIcon} className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <h2
              id="suggested-campaigns-heading"
              className="text-lg sm:text-xl lg:text-2xl font-extrabold text-gray-900 leading-tight"
            >
              {categoryName
                ? t("suggestedFromCategory", { category: categoryName })
                : t("suggestedTitle")}
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5 leading-snug">
              {t("suggestedSubtitle")}
            </p>
          </div>
        </div>

        {categoryName && (
          <Link
            href={categoryHref}
            className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold text-[#A5243D] hover:text-[#7D1830] hover:gap-2 transition-all group"
          >
            {t("viewAllInCategory")}
            <Arrow className="w-4 h-4 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
          </Link>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl overflow-hidden border border-gray-100 bg-gray-50"
            >
              <div className="aspect-[4/3] bg-gray-100 animate-pulse" />
              <div className="p-3 space-y-2">
                <div className="h-3 bg-gray-100 rounded-full animate-pulse w-3/4" />
                <div className="h-3 bg-gray-100 rounded-full animate-pulse w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {items!.map((c) => (
            <CampaignCard key={c.id} campaign={c} compact />
          ))}
        </div>
      )}
    </section>
  );
}
