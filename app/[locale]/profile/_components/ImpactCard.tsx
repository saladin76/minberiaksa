"use client";

import { Card } from "@/components/ui/card";
import {
  Award,
  Calendar,
  Flame,
  HandHeart,
  Repeat,
  Target,
  TrendingUp,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCurrency } from "@/context/CurrencyContext";

export interface ImpactCardProps {
  totalDonationsCount?: number;
  totalDonatedAmountUSD?: number;
  currentMonthlyMrrUSD?: number;
  activeSubscriptionsCount?: number;
  supportedCampaignsCount?: number;
  streakMonths?: number;
  badgesCount?: number;
  lastDonationAt?: string | null;
  locale?: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  TRY: "₺",
  SAR: "ر.س",
  AED: "د.إ",
};

function formatAmountInDisplayCurrency(
  amountUSD: number,
  convertToCurrency: (n: number) => { convertedValue?: number | null; currency?: string | null } | null
) {
  const converted = convertToCurrency(Math.round(amountUSD));
  const value = converted?.convertedValue ?? amountUSD;
  const currency = converted?.currency ?? "USD";
  const sym = CURRENCY_SYMBOLS[currency] || currency + " ";
  return `${sym}${(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function ImpactCard(props: ImpactCardProps) {
  const t = useTranslations("Profile.impact");
  const { convertToCurrency } = useCurrency();

  const total = formatAmountInDisplayCurrency(
    props.totalDonatedAmountUSD ?? 0,
    convertToCurrency
  );
  const mrr = formatAmountInDisplayCurrency(
    props.currentMonthlyMrrUSD ?? 0,
    convertToCurrency
  );

  const lastDonationLabel = props.lastDonationAt
    ? new Date(props.lastDonationAt).toLocaleDateString(
        props.locale === "ar" ? "ar-EG" : undefined,
        { day: "numeric", month: "short", year: "numeric" }
      )
    : "—";

  const cards: {
    Icon: typeof HandHeart;
    accent: string;
    bg: string;
    label: string;
    value: string;
    hint?: string;
  }[] = [
    {
      Icon: HandHeart,
      accent: "text-[#A5243D]",
      bg: "from-[#A5243D]/10 to-[#A5243D]/5 border-[#A5243D]/20",
      label: t("totalGiven"),
      value: total,
      hint: t("acrossDonations", { count: props.totalDonationsCount ?? 0 }),
    },
    {
      Icon: Repeat,
      accent: "text-[#D8AA55]",
      bg: "from-[#A5243D]/10 to-[#A5243D]/5 border-[#D8AA55]/20",
      label: t("monthlyMrr"),
      value: mrr,
      hint: t("acrossSubs", { count: props.activeSubscriptionsCount ?? 0 }),
    },
    {
      Icon: Target,
      accent: "text-emerald-600",
      bg: "from-emerald-50 to-white border-emerald-200",
      label: t("supportedCampaigns"),
      value: String(props.supportedCampaignsCount ?? 0),
      hint: t("distinctCampaigns"),
    },
    // {
    //   Icon: Flame,
    //   accent: "text-amber-600",
    //   bg: "from-amber-50 to-white border-amber-200",
    //   label: t("streak"),
    //   value:
    //     (props.streakMonths ?? 0) > 0
    //       ? t("monthsStreak", { count: props.streakMonths ?? 0 })
    //       : t("noStreak"),
    //   hint: lastDonationLabel !== "—" ? `${t("lastDonation")}: ${lastDonationLabel}` : undefined,
    // },
  ];

  // Optional bottom row: badges
  const showBadgesRow = (props.badgesCount ?? 0) > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {cards.map(({ Icon, accent, bg, label, value, hint }) => (
          <Card
            key={label}
            className={`p-4 sm:p-5 bg-gradient-to-br ${bg} border`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={`text-[10px] sm:text-xs font-semibold uppercase tracking-wider ${accent}`}>
                  {label}
                </p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1.5 truncate">
                  {value}
                </p>
                {hint && (
                  <p className="text-[11px] sm:text-xs text-gray-600 mt-1 line-clamp-1">{hint}</p>
                )}
              </div>
              <div className={`p-2 rounded-lg bg-white/70 ${accent}`}>
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            </div>
          </Card>
        ))}
      </div>
      {showBadgesRow && (
        <Card className="p-4 flex items-center gap-3">
          <Award className="w-5 h-5 text-amber-500" />
          <div className="text-sm text-gray-700">
            <span className="font-semibold">{t("badgesEarned", { count: props.badgesCount ?? 0 })}</span>{" "}
            <span className="text-gray-500">— {t("badgesHint")}</span>
          </div>
        </Card>
      )}
    </div>
  );
}

/** Compact, single-line variant for the sidebar (desktop). */
export function ImpactCompact(props: ImpactCardProps) {
  const t = useTranslations("Profile.impact");
  const { convertToCurrency } = useCurrency();

  const total = formatAmountInDisplayCurrency(
    props.totalDonatedAmountUSD ?? 0,
    convertToCurrency
  );

  return (
    <div className="flex flex-col items-stretch gap-2 mt-4 p-3 rounded-xl bg-[#A5243D]/5 border border-[#A5243D]/10">
      <div className="flex items-center gap-2 text-xs text-[#A5243D]">
        <TrendingUp className="w-3.5 h-3.5" />
        <span className="uppercase font-semibold tracking-wider">{t("totalGiven")}</span>
      </div>
      <div className="text-xl font-bold text-gray-900">{total}</div>
      <div className="flex items-center justify-between text-xs text-gray-600">
        <span className="flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />
          {t("acrossDonations", { count: props.totalDonationsCount ?? 0 })}
        </span>
        {(props.streakMonths ?? 0) > 0 && (
          <span className="flex items-center gap-1 text-amber-700 font-medium">
            <Flame className="w-3.5 h-3.5" />
            {t("monthsStreak", { count: props.streakMonths ?? 0 })}
          </span>
        )}
      </div>
    </div>
  );
}
