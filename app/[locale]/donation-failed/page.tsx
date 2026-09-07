"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { Toaster, toast } from "react-hot-toast";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  HelpCircle,
  Landmark,
  Loader2,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  Wifi,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import BankAccountsBlock from "../bank-transfer/_components/BankAccountsBlock";
import {
  resolvePaymentError,
  type PaymentErrorKey,
  type ResolvedPaymentError,
} from "@/lib/donations/payment-error-catalog";

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  TRY: "₺",
  SAR: "ر.س",
  AED: "د.إ",
};

interface DonationDetails {
  id: string;
  amount: number;
  totalAmount: number;
  currency: string;
  status: string;
  paidAt: string | null;
  provider?: string | null;
  paymentMethod?: string | null;
  providerProcReturnCode?: string | null;
  providerErrorMessage?: string | null;
  providerTxnResult?: string | null;
  subscriptionId?: string | null;
  items?: Array<{
    id: string;
    amount: number;
    campaign?: { title?: string };
  }>;
}

/** Icon picker per error key — visual cue that matches the explanation. */
const ERROR_ICONS: Record<PaymentErrorKey, typeof AlertCircle> = {
  insufficientFunds: WalletCards,
  cardDeclined: CreditCard,
  expiredCard: CreditCard,
  invalidCvc: ShieldCheck,
  incorrectNumber: CreditCard,
  lostOrStolen: AlertTriangle,
  doNotHonor: AlertCircle,
  limitExceeded: WalletCards,
  currencyNotSupported: AlertCircle,
  authenticationFailed: ShieldCheck,
  processingError: RefreshCw,
  networkError: Wifi,
  issuerUnavailable: Landmark,
  fraudSuspected: AlertTriangle,
  generic: HelpCircle,
};

export default function DonationFailedPage() {
  const t = useTranslations("DonationFailed");
  const tErrors = useTranslations("DonationFailed.errors");
  const locale = useLocale();
  const isRtl = locale === "ar";
  const router = useRouter();
  const searchParams = useSearchParams();
  const donationId = searchParams?.get("donationId") ?? "";

  const [donation, setDonation] = useState<DonationDetails | null>(null);
  const [loading, setLoading] = useState(Boolean(donationId));
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!donationId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`/api/donations/${donationId}`);
        if (!cancelled) setDonation(res.data as DonationDetails);
      } catch (err) {
        console.error("Failed to load donation:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [donationId]);

  const resolved: ResolvedPaymentError = useMemo(
    () =>
      resolvePaymentError({
        providerProcReturnCode: donation?.providerProcReturnCode,
        providerErrorMessage: donation?.providerErrorMessage,
        providerTxnResult: donation?.providerTxnResult,
        provider: donation?.provider,
      }),
    [
      donation?.providerProcReturnCode,
      donation?.providerErrorMessage,
      donation?.providerTxnResult,
      donation?.provider,
    ]
  );

  const ErrorIcon = ERROR_ICONS[resolved.key];
  const isHard = resolved.severity === "hard";

  // Tips that are universal but order changes depending on retryability
  const fixTips: { key: string; label: string }[] = (() => {
    const allTips = [
      { key: "tipRetry", label: tErrors("commonTips.tipRetry") },
      { key: "tipCheckBalance", label: tErrors("commonTips.tipCheckBalance") },
      { key: "tipUseAnotherCard", label: tErrors("commonTips.tipUseAnotherCard") },
      { key: "tipContactBank", label: tErrors("commonTips.tipContactBank") },
      { key: "tipUseTransfer", label: tErrors("commonTips.tipUseTransfer") },
    ];
    if (isHard) {
      // Hard errors → push "use another card" / "use transfer" first.
      return [
        allTips[2], // another card
        allTips[3], // contact bank
        allTips[4], // bank transfer
        allTips[0], // retry
      ];
    }
    return allTips;
  })();

  // Pretty amount for the donation summary card
  const formattedAmount = donation
    ? `${CURRENCY_SYMBOLS[donation.currency] ?? donation.currency + " "}${donation.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : null;

  const isMonthly = Boolean(donation?.subscriptionId);

  const handleRetry = async () => {
    if (!donation || retrying) return;
    setRetrying(true);

    // Monthly subscriptions can't be cloned — send the donor back to the
    // campaign page where the regular dialog handles the subscribe flow.
    if (isMonthly) {
      const firstCampaignId = donation.items?.[0]?.campaign ? null : null;
      // Fallback to /campaigns since we don't have the campaign id stored
      router.push("/campaigns");
      return;
    }

    try {
      const res = await axios.post(`/api/donations/${donation.id}/retry`);
      const newId = res.data?.id as string | undefined;
      if (!newId) throw new Error("retry returned no id");

      // Pick the next-step URL by provider. STRIPE → checkout session URL.
      // The 3D Secure rails (PAYFOR, ALBARAKA) start from a signed form that needs
      // card details, so there's nothing to redirect to — bounce those donors back
      // to the campaign dialog. Default to Stripe for everything else.
      const provider = (donation.provider ?? "STRIPE").toUpperCase();
      if (provider === "PAYFOR" || provider === "ALBARAKA") {
        toast.success(t("retry.payforHint"));
        router.push("/campaigns");
        return;
      }

      // Stripe path — create a new Checkout Session and redirect.
      const checkout = await axios.post("/api/stripe/checkout", {
        donationId: newId,
        locale,
      });
      const url = checkout.data?.url as string | undefined;
      if (!url) throw new Error("stripe returned no url");
      window.location.href = url;
    } catch (err) {
      console.error("retry failed:", err);
      toast.error(t("retry.failed"));
      setRetrying(false);
    }
  };

  const Arrow = isRtl ? ArrowLeft : ArrowRight;

  return (
    <main className="min-h-screen bg-gray-50" dir={isRtl ? "rtl" : "ltr"}>
      <Toaster position="top-center" />

      {/* ───────────────────────────── Hero ───────────────────────────────── */}
      <section className="bg-gradient-to-br from-rose-600 via-rose-600 to-rose-700">
        <div className="max-w-3xl mx-auto px-4 py-12 sm:py-14 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/15 border border-white/30 mb-5 shadow-lg shadow-rose-900/20">
            <AlertCircle className="w-8 h-8 text-white" strokeWidth={2.25} />
          </div>
          <Badge className="bg-white/15 hover:bg-white/20 border-white/30 text-white/95 backdrop-blur-sm font-semibold uppercase tracking-wider text-[11px] mb-4">
            {t("badge")}
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight mb-3">
            {t("title")}
          </h1>
          <p className="text-white/85 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
            {t("description")}
          </p>
          <p className="mt-3 text-white/70 text-xs sm:text-sm">{t("reassurance")}</p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-10 space-y-6 sm:space-y-8">
        {/* ───────────── Loading skeleton (waiting on donation fetch) ─────── */}
        {loading && (
          <Card className="p-6 flex items-center justify-center gap-3 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">{t("loading")}</span>
          </Card>
        )}

        {/* ───────────── Error explanation card ──────────────────────────── */}
        {!loading && (
          <Card
            className={`p-5 sm:p-7 border-2 ${
              isHard
                ? "border-rose-200 bg-rose-50/50"
                : "border-amber-200 bg-amber-50/50"
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${
                  isHard ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                <ErrorIcon className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-[11px] uppercase tracking-wider font-bold mb-1 ${
                    isHard ? "text-rose-700" : "text-amber-700"
                  }`}
                >
                  {isHard ? t("severityHard") : t("severitySoft")}
                </p>
                <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 leading-tight">
                  {tErrors(`${resolved.key}.title`)}
                </h2>
                <p className="text-sm sm:text-base text-gray-700 mt-2 leading-relaxed">
                  {tErrors(`${resolved.key}.reason`)}
                </p>
              </div>
            </div>

            {/* What to do — actionable steps */}
            <div className="mt-5 sm:mt-6 ps-0 sm:ps-16">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                {t("howToFixTitle")}
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed mb-3">
                {tErrors(`${resolved.key}.fix`)}
              </p>
              <ul className="space-y-2">
                {fixTips.map((tip, idx) => (
                  <li key={tip.key} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <span
                      className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5 ${
                        idx === 0
                          ? "bg-[#A5243D] text-white"
                          : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span className="leading-relaxed">{tip.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Raw provider message — hidden by default to avoid scaring donors */}
            {donation?.providerErrorMessage && (
              <details className="mt-5 sm:mt-6 ps-0 sm:ps-16 group">
                <summary className="text-xs font-medium text-gray-500 hover:text-gray-700 cursor-pointer select-none inline-flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5" />
                  {t("rawMessageToggle")}
                </summary>
                <div className="mt-2 p-3 rounded-lg bg-gray-100 border border-gray-200">
                  <p className="text-xs text-gray-700 font-mono leading-relaxed break-words">
                    {donation.providerErrorMessage}
                  </p>
                  {donation.providerProcReturnCode && (
                    <p className="mt-1.5 text-[11px] text-gray-500">
                      {t("rawCodeLabel")}:{" "}
                      <span className="font-mono">{donation.providerProcReturnCode}</span>
                    </p>
                  )}
                </div>
              </details>
            )}
          </Card>
        )}

        {/* ───────────── Donation summary + Retry ────────────────────────── */}
        {!loading && donation && (
          <Card className="p-5 sm:p-7 border-2 border-[#A5243D]/20 bg-gradient-to-br from-[#A5243D]/5 to-white">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-lg bg-[#A5243D]/10 text-[#A5243D] flex items-center justify-center">
                <RefreshCw className="w-4.5 h-4.5" />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900">{t("retry.title")}</h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed mb-5">{t("retry.description")}</p>

            {/* Mini donation receipt */}
            <div className="rounded-xl bg-white border border-gray-200 p-4 mb-5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    {t("retry.amountLabel")}
                  </p>
                  <p className="text-2xl font-extrabold text-gray-900 mt-0.5">
                    {formattedAmount}
                    {isMonthly && (
                      <span className="text-sm font-medium text-gray-500 ms-1.5">
                        {t("retry.perMonth")}
                      </span>
                    )}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="border-[#A5243D]/30 text-[#A5243D] bg-[#A5243D]/5"
                >
                  {isMonthly ? t("retry.monthly") : t("retry.oneTime")}
                </Badge>
              </div>
              {donation.items && donation.items.length > 0 && (
                <ul className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                  {donation.items.slice(0, 4).map((it) => (
                    <li
                      key={it.id}
                      className="text-xs sm:text-sm text-gray-700 flex items-center gap-2 truncate"
                    >
                      <span className="w-1 h-1 rounded-full bg-gray-300 shrink-0" />
                      <span className="truncate">{it.campaign?.title ?? "—"}</span>
                    </li>
                  ))}
                  {donation.items.length > 4 && (
                    <li className="text-xs text-gray-500">
                      {t("retry.moreItems", { count: donation.items.length - 4 })}
                    </li>
                  )}
                </ul>
              )}
            </div>

            <Button
              onClick={handleRetry}
              disabled={retrying}
              size="lg"
              className="w-full sm:w-auto bg-[#A5243D] hover:bg-[#7D1830] text-white font-semibold gap-2 px-6"
            >
              {retrying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {isMonthly ? t("retry.ctaMonthly") : t("retry.cta")}
              <Arrow className="w-4 h-4" />
            </Button>
            <p className="text-xs text-gray-500 mt-2.5">{t("retry.securedBy")}</p>
          </Card>
        )}

        {/* Even without a donationId, give the user a path forward */}
        {!loading && !donation && (
          <Card className="p-5 sm:p-7 text-center border-2 border-[#A5243D]/20 bg-[#A5243D]/5">
            <h3 className="text-lg font-bold text-gray-900 mb-2">{t("noDonation.title")}</h3>
            <p className="text-sm text-gray-600 mb-5">{t("noDonation.description")}</p>
            <Link
              href="/campaigns"
              className="inline-flex items-center gap-2 bg-[#A5243D] hover:bg-[#7D1830] text-white font-semibold text-sm px-5 py-2.5 rounded-full transition-colors"
            >
              {t("noDonation.cta")}
              <Arrow className="w-4 h-4" />
            </Link>
          </Card>
        )}
      </div>

      {/* ───────────────────────── Bank transfer fallback ──────────────── */}
      <div className="border-y border-amber-100 bg-amber-50">
        <div className="max-w-3xl mx-auto px-4 py-4 text-center">
          <p className="text-sm text-amber-800 font-medium flex items-center justify-center gap-2">
            <Landmark className="w-4 h-4" />
            {t("manualFallback")}
          </p>
        </div>
      </div>

      <BankAccountsBlock />
    </main>
  );
}
