"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import { appendCurrencyQuery, currencyCodeForUrl, getCurrencyCodeForLinks } from "@/lib/currency-link";
import { useSearchParams } from "next/navigation";
import { getCurrencySymbol } from "@/hooks/useCampaignValue";
import { formatNumber } from "@/hooks/formatNumber";
import { useCurrency } from "@/context/CurrencyContext";
import { useTranslations } from "next-intl";

const DonationDialog = dynamic(() => import("@/components/DonationDialog"), { ssr: false });
import CategoryIcon from "@/components/CategoryIcon";
import { Share2, ShoppingCart, Zap } from "lucide-react";
import {
  parseSuggestedDonations,
  resolveSuggestedAmountsForCurrency,
  type SuggestedDonationsConfig,
} from "@/lib/campaign/suggested-donations";
import type { SuggestedTeamSupportConfig } from "@/lib/campaign/suggested-team-support";
import type { ShareLabelsConfig } from "@/lib/campaign/share-labels";
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

/* Four is what the card has room for beside the custom-amount field; the
   dashboard may configure more, which belong in the dialog, not here. */
const CARD_AMOUNT_CHIPS = 4;

export function CampaignCard({ campaign, className, onClick, isFeatured = false, listView = false }: CampaignCardProps) {
  const t = useTranslations("CampaignsPage");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { convertToCurrency } = useCurrency();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [donationOpen, setDonationOpen] = useState(false);
  const [donationDialogMounted, setDonationDialogMounted] = useState(false);
  const [donationContext, setDonationContext] = useState<DonationDialogCampaignContext | null>(null);
  const [addToCartMode, setAddToCartMode] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [pendingAmount, setPendingAmount] = useState<number | undefined>(undefined);
  /* The currency helpers read document.cookie, so they answer "USD" on the
     server and the visitor's real currency in the browser. The amount chips put
     currency text on every card — where before it only appeared on the few with
     a fixed goal — which turned that latent disagreement into a hydration
     mismatch. Render the server's answer through the hydration pass, then swap. */
  const [currencyReady, setCurrencyReady] = useState(false);
  useEffect(() => setCurrencyReady(true), []);

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

  /* Quick amounts are for plain money campaigns only. A share campaign counts
     sheep or meals, and team support has its own step; handing either an
     `initialDonationAmount` makes the dialog skip straight past the step that
     asks the real question. Those cards keep the buttons and drop the chips. */
  /* `suggestedTeamSupport` ships as {amounts: [], byCurrency: {}} on every
     campaign, so its presence means nothing — only a configured amount does. */
  const takesPlainAmount =
    String(campaign.fundraisingMode ?? "").toUpperCase() !== "SHARES" &&
    !campaign.suggestedTeamSupport?.amounts?.length;
  const chipAmounts = takesPlainAmount
    ? resolveSuggestedAmountsForCurrency(
        parseSuggestedDonations(campaign.suggestedDonations),
        currencyReady ? getCurrencyCodeForLinks() : currencyCodeForUrl(undefined)
      ).slice(0, CARD_AMOUNT_CHIPS)
    : [];
  /* Same reason as `chipAmounts`: the symbol is cookie-derived. */
  const chipSymbol = currencyReady ? symbol : "$";
  const chosenAmount = custom ? Number(custom) : picked;

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

  const openDialog = (forCart: boolean) => {
    setAddToCartMode(forCart);
    setPendingAmount(chosenAmount && chosenAmount > 0 ? chosenAmount : undefined);
    setDonationContext(snapshotDonationContext());
    setDonationDialogMounted(true);
    setDonationOpen(true);
  };

  const handleDonateClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openDialog(false);
  };

  const handleAddToCartClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openDialog(true);
  };

  const handleShareClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/${locale}${detailHref}`;
    if (navigator.share) {
      // A cancelled share rejects; that is a user action, not an error.
      await navigator.share({ title: campaign.title, url }).catch(() => {});
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(url).catch(() => {});
    }
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

      {/* ── Card view (always on sm+, always when not listView) ──
          The urgent-projects card, in campaign clothing: one field photograph
          filling the card under a dark scrim, everything else stacked over its
          lower half. See components/minbar/ProjectDonateCard.tsx — the two are
          meant to read as the same object across the site. */}
      <div
        className={`${listView && !isFeatured ? "hidden sm:flex" : "flex"} project-card group/card relative overflow-hidden rounded-2xl bg-deep shadow-soft transition-all duration-300 hover:shadow-lift flex-col ${isFeatured ? "min-h-[30rem] ring-1 ring-gold/40" : "min-h-[26.875rem]"} ${className ?? ""}`}
        /* Not Tailwind's `border-border`: that compiles to hsl(var(--border)),
           and inside .mia-scope --border is an rgba() — the wrap makes it
           invalid and the border vanishes. */
        style={{ border: "1px solid var(--border)" }}
      >
        <Image
          src={isFeatured ? buildImgSrc(rawImgSrc, 960, 720) : imgSrc}
          alt={campaign.title}
          fill
          sizes={isFeatured ? "(max-width: 640px) 90vw, 50vw" : "(max-width: 640px) 70vw, (max-width: 1024px) 300px, 25vw"}
          className="object-cover transition-transform duration-700 ease-out group-hover/card:scale-105"
          draggable={false}
          priority={isFeatured}
          quality={70}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(0deg, rgba(16,33,43,.96) 26%, rgba(16,33,43,.72) 52%, rgba(16,33,43,.18) 82%)",
          }}
        />

        {/* Featured badge — top end */}
        {isFeatured && (
          <div className="absolute top-3.5 end-3.5 z-10">
            <span className="shape-chip inline-flex items-center gap-1.5 bg-burgundy px-3 py-1.5 text-[11px] font-black text-white shadow-soft">
              <Zap className="h-3 w-3 fill-white" />
              {t("featuredBadge")}
            </span>
          </div>
        )}

        {/* Category chip — top start */}
        {campaign.category?.name && (
          <span className="absolute top-3.5 start-3.5 z-10 inline-flex items-center gap-1.5 rounded-full bg-deep/70 px-2.5 py-1 text-[11px] font-black text-white">
            <CategoryIcon name={campaign.category.icon} className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="max-w-[8rem] truncate">{campaign.category.name}</span>
          </span>
        )}

        {/* Everything else rides the bottom of the photo */}
        <div className="relative mt-auto grid gap-3 p-[18px]">
          <Link href={detailHref} prefetch={true} onClick={onClick} className="block text-white">
            <h3 className={`font-extrabold leading-snug text-white drop-shadow-sm line-clamp-2 ${isFeatured ? "text-xl lg:text-2xl" : "text-[19px]"}`}>
              {campaign.title}
            </h3>
          </Link>

          {campaign.showProgress !== false && !hideBottomStats ? (
            <div className="grid gap-[7px]">
              {/* burgundy/gold are the same hex as --red/--gold, which is what
                  the project card's gradient uses. */}
              <span className="block h-1 rounded-full bg-white/20">
                <span
                  className="block h-full rounded-full bg-gradient-to-l from-burgundy to-gold transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </span>
              <span className="flex justify-between text-[12.5px] text-white/70">
                <b dir="ltr" className="tabular-nums text-white [unicode-bidi:isolate]">{symbol}{formatNumber(raised)}</b>
                <span dir="ltr" className="tabular-nums [unicode-bidi:isolate]">{t("goal") || "الهدف"} {symbol}{formatNumber(target)}</span>
              </span>
            </div>
          ) : null}

          {chipAmounts.length > 0 && (
            <div className="flex flex-wrap gap-[7px]">
              {chipAmounts.map((value) => {
                const active = picked === value && !custom;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setPicked(value);
                      setCustom("");
                    }}
                    className={`h-[34px] cursor-pointer whitespace-nowrap rounded-full border px-[13px] text-[13px] font-extrabold text-white transition-all duration-150 ${active ? "border-gold bg-gold" : "border-white/30 bg-white/10"}`}
                  >
                    <span dir="ltr" className="[unicode-bidi:isolate]">{chipSymbol}{formatNumber(value)}</span>
                  </button>
                );
              })}
              <input
                value={custom}
                onChange={(e) => {
                  setCustom(e.target.value.replace(/[^0-9]/g, ""));
                  setPicked(null);
                }}
                onClick={(e) => e.stopPropagation()}
                inputMode="decimal"
                placeholder={tCommon("freeAmount")}
                aria-label={tCommon("freeAmount")}
                /* Grows into whatever the chips leave, which on a card this
                   narrow is usually a line of its own — squared off rather than
                   a ragged stub, and wide enough for the longer translations. */
                className={`h-[34px] min-w-[9ch] flex-[1_1_9ch] rounded-full border bg-white/10 px-3 text-[13px] font-extrabold text-white placeholder:text-white/60 focus:outline-none ${custom ? "border-gold" : "border-white/30"}`}
              />
            </div>
          )}

          {/* Donate fills the row; basket and share are the same 42px pair the
              project cards use, so the action row matches site-wide. */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleDonateClick}
              className="inline-flex h-[42px] flex-1 items-center justify-center rounded-full bg-burgundy text-sm font-black text-white transition-colors hover:bg-burgundyDark"
            >
              {tCommon("donateNow")}
            </button>
            <button
              onClick={handleAddToCartClick}
              data-icon-action=""
              aria-label={tCommon("addToCart")}
              title={tCommon("addToCart")}
              className="grid h-[42px] w-[42px] flex-shrink-0 place-items-center rounded-full border border-white/30 bg-white/10 text-white transition-all duration-150"
            >
              <ShoppingCart className="h-[18px] w-[18px]" />
            </button>
            <button
              onClick={handleShareClick}
              data-icon-action=""
              aria-label={tCommon("share")}
              title={tCommon("share")}
              className="grid h-[42px] w-[42px] flex-shrink-0 place-items-center rounded-full border border-white/30 bg-white/10 text-white transition-all duration-150"
            >
              <Share2 className="h-[17px] w-[17px]" />
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
          setPendingAmount(undefined);
        }}
        oneTimeOnly={addToCartMode}
        initialDonationAmount={pendingAmount}
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
