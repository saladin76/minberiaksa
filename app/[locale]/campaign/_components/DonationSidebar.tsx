/* eslint-disable @typescript-eslint/no-explicit-any */
import DonationDialog from "@/components/DonationDialog";
import SharePopup from "@/components/SharePopup";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/context/CurrencyContext";
import { usePathname, useRouter } from "@/i18n/routing";
import { appendCurrencyQuery, getCurrencyCodeForLinks } from "@/lib/currency-link";
import { HandCoins, HandHeart, Share2, ShieldCheck, Lock, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import React, { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";

// Shared across instances (MainPageDummy renders desktop + mobile sidebars); only one should open the dialog
let openDonationHandledThisLoad = false;

interface DonationSidebarProps {
  campaign: any;
  isMobileSticky?: boolean;
}

const DonationSidebar = ({ campaign, isMobileSticky = false }: DonationSidebarProps) => {
  const t = useTranslations("Campaign");
  const tTrust = useTranslations("SignInDialog");
  const locale = useLocale() as "ar" | "en" | "fr";
  const { convertToCurrency } = useCurrency();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isDonationOpen, setIsDonationOpen] = useState(false);

  // After sign-in redirect: open donation dialog once and clean URL (only one instance handles it)
  useEffect(() => {
    if (searchParams.get("openDonation") !== "1") {
      openDonationHandledThisLoad = false;
      return;
    }
    if (openDonationHandledThisLoad) return;
    openDonationHandledThisLoad = true;
    setIsDonationOpen(true);
    router.replace(appendCurrencyQuery(pathname, getCurrencyCodeForLinks()));
  }, [searchParams, pathname, router]);

  const donationCallbackUrl =
    typeof window !== "undefined"
      ? appendCurrencyQuery(`${pathname}?openDonation=1`, getCurrencyCodeForLinks())
      : undefined;

  // Helper function to get locale-specific property
  const getLocalizedProperty = (obj: any, key: string) => {
    const localeKey = `${key}${locale.charAt(0).toUpperCase() + locale.slice(1)}`;
    return obj[localeKey] || obj[key] || "";
  };

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

  const handleDonate = () => {
    setIsDonationOpen(true);
  };

  const handleShare = () => {
    setIsShareOpen(true);
  };

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const isOpenGoal = String(campaign.goalType ?? "").toLowerCase() === "open";
  const hasTargetAmount = Number(campaign.targetAmount) > 0;
  const hideAmountAndDonors = isOpenGoal && !hasTargetAmount;
  const showProgress = campaign.showProgress !== false;
  const pct = Math.min(100, Math.max(0, Number(campaign.progress) || 0));

  // Reusable on-brand gradient progress bar
  const ProgressBar = ({ height = "h-2.5" }: { height?: string }) => (
    <div className={`relative w-full ${height} rounded-full bg-gray-200/80 overflow-hidden`}>
      <div
        className="absolute inset-y-0 start-0 rounded-full bg-gradient-to-r from-burgundy via-burgundy to-gold transition-[width] duration-700 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );

  const dialogEl = (
    <>
      <SharePopup
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        url={shareUrl}
        title={getLocalizedProperty(campaign, "title")}
        description={getLocalizedProperty(campaign, "description")}
        image={campaign.images[0]}
      />
      <DonationDialog
        isOpen={isDonationOpen}
        onClose={() => setIsDonationOpen(false)}
        campaignTitle={getLocalizedProperty(campaign, "title")}
        campaignImage={campaign.images[0]}
        targetAmount={campaign.targetAmount}
        amountRaised={campaign.amountRaised}
        campaignId={campaign.id}
        suggestedDonations={campaign.suggestedDonations}
        suggestedTeamSupport={campaign.suggestedTeamSupport}
        goalType={campaign.goalType}
        fundraisingMode={campaign.fundraisingMode}
        sharePriceUSD={campaign.sharePriceUSD}
        suggestedShareCounts={campaign.suggestedShareCounts}
        shareLabels={campaign.shareLabels}
        authCallbackUrl={donationCallbackUrl}
      />
    </>
  );

  // ── Mobile Sticky Bottom Bar ──
  if (isMobileSticky) {
    return (
      <>
        {dialogEl}
        <div className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-t border-gray-200 shadow-[0_-8px_30px_-12px_rgba(2,29,50,.25)]">
          {/* Thin progress strip flush to the top edge */}
          {!hideAmountAndDonors && showProgress && (
            <div className="h-1 w-full bg-gray-100">
              <div
                className="h-full bg-gradient-to-r from-burgundy to-gold transition-[width] duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
          <div className="px-4 pt-2.5 pb-3">
            {!hideAmountAndDonors && (
              <div className="flex items-end justify-between mb-2.5">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-gray-500 leading-none mb-1">
                    {showProgress ? `${t("from")} ${formatMoney(campaign.targetAmount)}` : t("peopleDonated")}
                  </p>
                  <p className="text-xl font-extrabold text-deep leading-none">
                    {formatMoney(campaign.currentAmount)}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-right shrink-0">
                  {showProgress && (
                    <span className="text-sm font-bold text-burgundy tabular-nums">{Math.round(pct)}%</span>
                  )}
                  <span className="flex items-center gap-1 text-xs font-semibold text-gray-600">
                    <HandHeart className="w-4 h-4 text-burgundy" />
                    {campaign.donationCount}
                  </span>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                onClick={handleDonate}
                className="flex-1 flex gap-2 shape-button bg-burgundy hover:bg-burgundyDark text-white font-bold py-3.5 text-base transition-all duration-200 shadow-soft hover:shadow-lift"
              >
                <HandCoins className="w-5 h-5" />
                {t("donateNow")}
              </Button>
              <Button
                onClick={handleShare}
                aria-label={t("share")}
                className="flex-shrink-0 flex gap-2 shape-button bg-deep hover:bg-navy text-white font-semibold py-3.5 px-4 border-0 transition-all duration-200 shadow-soft hover:shadow-lift"
              >
                <Share2 className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Desktop Card ──
  return (
    <div className="h-full">
      {dialogEl}

      <div className="sticky top-32 space-y-4">
        {/* Donation card */}
        <div className="relative bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
          {/* Gold accent header strip */}
          <div className="h-1.5 w-full bg-gradient-to-r from-burgundy via-burgundy to-gold" />

          <div className="p-6 lg:p-7">
            {!hideAmountAndDonors ? (
              <>
                {/* Raised amount */}
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[2.6rem] leading-none font-extrabold text-deep tracking-tight">
                    {formatMoney(campaign.currentAmount)}
                  </span>
                  {showProgress && (
                    <span className="text-sm font-bold text-burgundy bg-burgundy/10 px-2.5 py-1 rounded-full tabular-nums">
                      {Math.round(pct)}%
                    </span>
                  )}
                </div>
                {showProgress && (
                  <p className="mt-1.5 text-sm text-gray-500">
                    {t("outOfGoal")}{" "}
                    <span className="font-bold text-gray-700">{formatMoney(campaign.targetAmount)}</span>
                  </p>
                )}

                {/* Progress bar */}
                {showProgress && (
                  <div className="mt-4">
                    <ProgressBar />
                  </div>
                )}

                {/* Donor proof */}
                <div className="mt-5 flex items-center gap-2.5 rounded-2xl bg-offwhite/70 px-4 py-3">
                  <div className="w-9 h-9 rounded-full bg-burgundy/10 flex items-center justify-center flex-shrink-0">
                    <HandHeart className="w-[18px] h-[18px] text-burgundy" />
                  </div>
                  <p className="text-sm text-gray-700">
                    <span className="font-extrabold text-deep">{campaign.donationCount.toLocaleString()}</span>{" "}
                    {t("peopleDonated")}
                  </p>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-burgundy/10 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-burgundy" />
                </div>
                <p className="text-base font-semibold text-deep">{t("donateNow")}</p>
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-6 space-y-3">
              <Button
                onClick={handleDonate}
                className="w-full flex gap-2 shape-button bg-burgundy hover:bg-burgundyDark text-white font-bold py-6 text-lg transition-all duration-200 shadow-soft hover:shadow-lift"
              >
                <HandCoins className="w-5 h-5" />
                {t("donateNow")}
              </Button>
              <Button
                onClick={handleShare}
                variant="outline"
                className="w-full flex gap-2 shape-button bg-white hover:bg-offwhite text-deep font-semibold py-6 text-lg border-2 border-gray-200 hover:border-gold transition-all duration-200"
              >
                <Share2 className="w-5 h-5" />
                {t("share")}
              </Button>
            </div>
          </div>

          {/* Trust footer */}
          <div className="border-t border-gray-100 bg-offwhite/40 px-6 lg:px-7 py-3.5 flex items-center justify-between text-[11px] font-semibold text-gray-500">
            <span className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-600" />
              {tTrust("secure")}
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              {tTrust("trusted")}
            </span>
            <span className="flex items-center gap-1.5">
              <HandHeart className="w-3.5 h-3.5 text-burgundy" />
              {tTrust("community")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DonationSidebar;
