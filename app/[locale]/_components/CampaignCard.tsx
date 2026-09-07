"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import { appendCurrencyQuery, getCurrencyCodeForLinks } from "@/lib/currency-link";
import { useSearchParams } from "next/navigation";
import { getCurrencySymbol } from "@/hooks/useCampaignValue";
import { formatNumber } from "@/hooks/formatNumber";
import { useCurrency } from "@/context/CurrencyContext";
import { useTranslations } from "next-intl";

const DonationDialog = dynamic(() => import("@/components/DonationDialog"), { ssr: false });
import CategoryIcon from "@/components/CategoryIcon";
import { Heart, ShoppingCart, Zap } from "lucide-react";
import type { SuggestedDonationsConfig } from "@/lib/campaign/suggested-donations";
import type { SuggestedTeamSupportConfig } from "@/lib/campaign/suggested-team-support";
import { resolveSharePlural, type ShareLabelsConfig } from "@/lib/campaign/share-labels";
import { useLocale } from "next-intl";

const RESUME_KEY = "campaignDonateResume";
const FALLBACK_IMG = "https://i.ibb.co/N2zVsqfg/calisma-alanlarimiz-egitim-sektoru.jpg";

// 4:3 crop — matches the aspect-[4/3] container used everywhere.
// q_auto:eco is ~30% smaller than q_auto:good with no perceptible quality loss for thumbnails;
// f_auto serves AVIF/WebP automatically based on the Accept header.
function buildImgSrc(src: string, width = 640, height = 480): string {
  if (!src.includes("res.cloudinary.com")) return src;
  return src.replace(
    /\/upload\//,
    `/upload/f_auto,q_auto:eco,w_${width},h_${height},c_fill,g_auto/`
  );
}

export interface CampaignCardData {
  id: string;
  slug?: string | null;
  images: string[];
  title: string;
  description: string;
  currentAmount: number;
  targetAmount: number;
  progress?: number;
  showProgress?: boolean;
  fundraisingMode?: string;
  goalType?: string;
  sharePriceUSD?: number | null;
  suggestedShareCounts?: { counts: number[]; priceByCurrency?: Record<string, number> } | null;
  suggestedDonations?: SuggestedDonationsConfig | null;
  suggestedTeamSupport?: SuggestedTeamSupportConfig | null;
  /** Per-campaign custom unit names ("sheep" / "meal" / etc.) keyed by locale. */
  shareLabels?: ShareLabelsConfig | null;
  category?: { id?: string; slug?: string | null; name?: string; icon?: string | null } | null;
}

type DonationDialogCampaignContext = {
  goalType?: string;
  fundraisingMode?: string;
  sharePriceUSD?: number | null;
  suggestedShareCounts?: { counts: number[]; priceByCurrency?: Record<string, number> } | null;
  suggestedDonations?: SuggestedDonationsConfig | null;
  suggestedTeamSupport?: SuggestedTeamSupportConfig | null;
  shareLabels?: ShareLabelsConfig | null;
};

interface CampaignCardProps {
  campaign: CampaignCardData;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  isFeatured?: boolean;
  compact?: boolean;
  listView?: boolean;
}

export function CampaignCard({ campaign, className, onClick, isFeatured = false, listView = false }: CampaignCardProps) {
  const t = useTranslations("CampaignsPage");
  const locale = useLocale();
  const { convertToCurrency } = useCurrency();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [donationOpen, setDonationOpen] = useState(false);
  const [donationDialogMounted, setDonationDialogMounted] = useState(false);
  const [donationContext, setDonationContext] = useState<DonationDialogCampaignContext | null>(null);
  const [addToCartMode, setAddToCartMode] = useState(false);

  const snapshotDonationContext = (): DonationDialogCampaignContext => ({
    goalType: campaign.goalType,
    fundraisingMode: campaign.fundraisingMode,
    sharePriceUSD: campaign.sharePriceUSD ?? null,
    suggestedShareCounts: campaign.suggestedShareCounts ?? null,
    shareLabels: campaign.shareLabels ?? null,
    suggestedDonations: campaign.suggestedDonations ?? null,
    suggestedTeamSupport: campaign.suggestedTeamSupport ?? null,
  });

  const progress = Math.min(Number(campaign.progress ?? 0), 100);
  const raised = convertToCurrency(Math.round(campaign.currentAmount)).convertedValue ?? 0;
  const target = convertToCurrency(Math.round(campaign.targetAmount)).convertedValue ?? 0;
  const symbol = getCurrencySymbol();
  const isOpenGoal = String(campaign.goalType ?? "").toLowerCase() === "open";
  const hasTargetAmount = Number(campaign.targetAmount) > 0;
  const hideBottomStats = isOpenGoal && !hasTargetAmount;

  useEffect(() => {
    if (searchParams.get("openCampaignDonation") !== "1") return;
    try {
      const stored = typeof window !== "undefined" ? sessionStorage.getItem(RESUME_KEY) : null;
      if (!stored) return;
      const data = JSON.parse(stored) as { campaignId?: string } & DonationDialogCampaignContext;
      if (data.campaignId !== campaign.id) return;
      sessionStorage.removeItem(RESUME_KEY);
      setDonationContext({
        goalType: data.goalType ?? campaign.goalType,
        fundraisingMode: data.fundraisingMode ?? campaign.fundraisingMode,
        sharePriceUSD: data.sharePriceUSD ?? campaign.sharePriceUSD ?? null,
        suggestedShareCounts: data.suggestedShareCounts ?? campaign.suggestedShareCounts ?? null,
        suggestedDonations: data.suggestedDonations ?? campaign.suggestedDonations ?? null,
        suggestedTeamSupport: data.suggestedTeamSupport ?? campaign.suggestedTeamSupport ?? null,
        shareLabels: data.shareLabels ?? campaign.shareLabels ?? null,
      });
      setDonationDialogMounted(true);
      setDonationOpen(true);
    } catch { /* ignore */ }
    router.replace(appendCurrencyQuery(pathname, getCurrencyCodeForLinks()));
  }, [
    searchParams,
    campaign.id,
    campaign.goalType,
    campaign.fundraisingMode,
    campaign.sharePriceUSD,
    campaign.suggestedShareCounts,
    campaign.suggestedDonations,
    pathname,
    router,
  ]);

  const handleDonateClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAddToCartMode(false);
    setDonationContext(snapshotDonationContext());
    setDonationDialogMounted(true);
    setDonationOpen(true);
  };

  const handleAddToCartClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAddToCartMode(true);
    setDonationContext(snapshotDonationContext());
    setDonationDialogMounted(true);
    setDonationOpen(true);
  };

  const storeDonationResume = () => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(
      RESUME_KEY,
      JSON.stringify({
        campaignId: campaign.id,
        ...snapshotDonationContext(),
      })
    );
  };

  const rawImgSrc = campaign.images[0] || FALLBACK_IMG;
  const imgSrc = buildImgSrc(rawImgSrc);

  const detailHref = `/campaign/${campaign.slug || campaign.id}`;

  return (
    <>
      {/* ── Mobile horizontal list row (listView only, hidden on sm+) ── */}
      {listView && !isFeatured && (
        <div className="sm:hidden flex flex-row bg-white shape-card overflow-hidden shadow-soft">
          <Link href={detailHref} onClick={onClick} className="relative flex-shrink-0 w-28 aspect-square">
            <Image src={buildImgSrc(rawImgSrc, 320, 320)} alt={campaign.title} fill sizes="112px" className="object-cover" draggable={false} />
          </Link>
          <div className="flex flex-col justify-between flex-1 min-w-0 px-3 py-2.5">
            {campaign.category?.name && (
              <p className="text-[10px] text-gray-500 font-semibold truncate mb-0.5">{campaign.category.name}</p>
            )}
            <Link href={detailHref} onClick={onClick}>
              <h3 className="text-[13px] font-extrabold text-deep line-clamp-2 leading-snug">{campaign.title}</h3>
            </Link>
            <div className="mt-1.5">
              <div className="w-full bg-gray-100 rounded-full h-[3px] mb-1">
                <div className="bg-gradient-to-r from-burgundy to-gold h-[3px] rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-black text-deep">{symbol}{formatNumber(raised)} <span className="font-normal text-gray-400">{t("raised") || "جُمع"}</span></p>
                <button onClick={handleDonateClick} className="shape-chip text-[10px] font-bold text-white bg-burgundy hover:bg-burgundyDark px-2.5 py-1 transition-colors flex-shrink-0">
                  {t("donateNow") || "تبرع"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Card view (always on sm+, always when not listView) ── */}
      <div
        className={`${listView && !isFeatured ? "hidden sm:flex" : "flex"} project-card group/card relative bg-white shape-card overflow-hidden shadow-soft hover:shadow-lift transition-all duration-300 flex-col ${isFeatured ? "ring-1 ring-gold/40" : ""} ${className ?? ""}`}
      >
        {/* Image with title + gold-mark overlaid */}
        <Link href={detailHref} prefetch={true} onClick={onClick} className="relative flex-1 block">
          <div className="relative w-full overflow-hidden h-full min-h-[12rem] sm:min-h-[14rem]">
            <Image
              src={isFeatured ? buildImgSrc(rawImgSrc, 960, 720) : imgSrc}
              alt={campaign.title}
              fill
              sizes={isFeatured ? "(max-width: 640px) 90vw, 50vw" : "(max-width: 640px) 70vw, (max-width: 1024px) 300px, 25vw"}
              className="object-cover group-hover/card:scale-105 transition-transform duration-700 ease-out"
              draggable={false}
              priority={isFeatured}
              quality={70}
            />

            {/* Bottom gradient scrim (design: image-overlay) */}
            <div className="image-overlay absolute inset-x-0 bottom-0 h-2/3" />

            {/* Featured badge — top end */}
            {isFeatured && (
              <div className="absolute top-5 end-5">
                <span className="shape-chip inline-flex items-center gap-1.5 bg-burgundy text-white text-[11px] font-black px-3 py-1.5 shadow-soft">
                  <Zap className="w-3 h-3 fill-white" />
                  {t("featuredBadge")}
                </span>
              </div>
            )}

            {/* Category label — top start (design places a small white label here) */}
            {campaign.category?.name && (
              <span className="absolute top-5 start-5 inline-flex items-center gap-1.5 text-xs font-bold text-white drop-shadow">
                <CategoryIcon name={campaign.category.icon} className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate max-w-[8rem]">{campaign.category.name}</span>
              </span>
            )}

            {/* gold-mark + title — overlaid at bottom */}
            <div className={`absolute bottom-0 inset-x-0 ${isFeatured ? "px-5 pb-5" : "px-4 pb-4"}`}>
              <div className="gold-mark-sm mb-2" />
              <h3 className={`text-white font-extrabold leading-tight drop-shadow-sm ${isFeatured ? "text-xl lg:text-2xl line-clamp-2" : "text-base sm:text-lg line-clamp-2"}`}>
                {campaign.title}
              </h3>
            </div>
          </div>
        </Link>

        {/* Body — progress + actions */}
        <div className="space-y-3 p-3.5 sm:p-4">
          {campaign.showProgress !== false && !hideBottomStats ? (
            <div className="space-y-2">
              <div className="flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{t("raised") || "جُمع"}</p>
                  <p className="text-deep font-black leading-none mt-0.5 whitespace-nowrap tabular-nums">{symbol}{formatNumber(raised)}</p>
                </div>
                <div className="text-end min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{t("goal") || "الهدف"}</p>
                  <p className="text-gray-500 font-semibold leading-none mt-0.5 whitespace-nowrap tabular-nums">{symbol}{formatNumber(target)}</p>
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className="bg-gradient-to-r from-burgundy to-gold rounded-full h-1.5 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            /* No fixed goal (open goal / shares) — branded "ongoing support" panel
               so the body is never visually empty between the image and the buttons. */
            // <div className="flex items-center justify-between gap-3 shape-chip border border-gray-100 bg-offwhite px-3.5 py-2.5">
            //   <div className="min-w-0 max-sm:flex max-sm:justify-between max-sm:items-center max-sm:w-full">
            //     <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{t("raised") || "جُمع"}</p>
            //     <p className="text-deep font-black leading-none mt-1 text-lg whitespace-nowrap tabular-nums">{symbol}{formatNumber(raised)}</p>
            //   </div>
            //   {/* Shares / open-goal label — hidden on small screens to keep cards compact */}
            //   <span className="hidden sm:inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-burgundy/[0.07] px-3 py-1.5 text-[11px] font-bold text-burgundy">
            //     <Heart className="w-3.5 h-3.5 fill-burgundy/30" />
            //     {campaign.fundraisingMode === "SHARES"
            //       ? resolveSharePlural(campaign.shareLabels ?? null, locale) ?? t("sharesCampaignLabel")
            //       : t("openGoalLabel")}
            //   </span>
            // </div>
            <></>
          )}

          {/* Action row — Detail + Donate, with cart secondary (design: Detay / Bağış Yap).
              The Detail link is hidden on mobile (the card image already links to the
              detail page) so Donate can expand and fill the freed space. */}
          <div className="flex items-center gap-2 pt-0.5">
            <Link
              href={detailHref}
              onClick={onClick}
              className="hidden sm:inline-flex shape-button border border-gray-200 px-3.5 py-2 text-[13px] font-semibold text-navy hover:bg-offwhite transition-colors whitespace-nowrap"
            >
              {t("details") || "Detay"}
            </Link>
            <button
              onClick={handleAddToCartClick}
              aria-label={t("addToCart") || "Add to cart"}
              title={t("addToCart") || "Add to cart"}
              className="shape-button border border-gray-200 p-2 text-navy hover:bg-offwhite transition-colors flex-shrink-0 sm:ms-auto"
            >
              <ShoppingCart className="w-4 h-4" />
            </button>
            <button
              onClick={handleDonateClick}
              className="shape-button inline-flex items-center justify-center gap-1.5 bg-burgundy hover:bg-burgundyDark px-4 py-2 text-[13px] font-semibold text-white transition-colors group/btn flex-1 sm:flex-none whitespace-nowrap"
            >
              <Heart className="w-3.5 h-3.5 fill-white/30 group-hover/btn:fill-white/60 transition-all flex-shrink-0" />
              {t("donateNow") || "تبرع الآن"}
            </button>
          </div>
        </div>
      </div>

      {donationDialogMounted && (
      <DonationDialog
        isOpen={donationOpen}
        onClose={() => {
          setDonationOpen(false);
          setDonationContext(null);
          setAddToCartMode(false);
        }}
        oneTimeOnly={addToCartMode}
        campaignId={campaign.id}
        campaignTitle={campaign.title}
        campaignImage={rawImgSrc}
        fundraisingMode={donationContext?.fundraisingMode ?? campaign.fundraisingMode}
        targetAmount={campaign.targetAmount}
        amountRaised={campaign.currentAmount}
        goalType={donationContext?.goalType ?? campaign.goalType}
        sharePriceUSD={donationContext?.sharePriceUSD ?? campaign.sharePriceUSD ?? null}
        suggestedShareCounts={donationContext?.suggestedShareCounts ?? campaign.suggestedShareCounts ?? null}
        shareLabels={donationContext?.shareLabels ?? campaign.shareLabels ?? null}
        suggestedDonations={donationContext?.suggestedDonations ?? campaign.suggestedDonations ?? null}
        suggestedTeamSupport={donationContext?.suggestedTeamSupport ?? campaign.suggestedTeamSupport ?? null}
        authCallbackUrl={
          typeof window !== "undefined"
            ? appendCurrencyQuery(
                `${pathname}?openCampaignDonation=1`,
                getCurrencyCodeForLinks()
              )
            : undefined
        }
        onAuthCheckpoint={storeDonationResume}
      />
      )}
    </>
  );
}

export default CampaignCard;
