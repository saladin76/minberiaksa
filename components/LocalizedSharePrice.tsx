"use client";

import { useCurrency } from "@/context/CurrencyContext";
import {
  parseSuggestedShareCounts,
  resolveSharePriceOverride,
} from "@/lib/campaign/campaign-modes";
import { formatNumber } from "@/hooks/formatNumber";
import { getCurrency, getCurrencySymbol } from "@/hooks/useCampaignValue";

type Props = {
  sharePriceUSD: number;
  suggestedShareCounts?: unknown;
  className?: string;
};

/**
 * Renders one-share price in the visitor's selected currency, honoring
 * per-currency overrides from campaign suggestedShareCounts.priceByCurrency.
 */
export function LocalizedSharePrice({
  sharePriceUSD,
  suggestedShareCounts,
  className,
}: Props) {
  const { convertToCurrency } = useCurrency();
  const parsed = parseSuggestedShareCounts(suggestedShareCounts ?? null);
  const codeRaw = getCurrency();
  const code = !codeRaw || codeRaw === "DEFAULT" ? "USD" : codeRaw;

  const override = resolveSharePriceOverride(parsed, code);
  const price =
    override != null
      ? override
      : (() => {
          const r = convertToCurrency(sharePriceUSD);
          return r?.convertedValue != null && Number.isFinite(r.convertedValue)
            ? (r.convertedValue as number)
            : sharePriceUSD;
        })();

  const label =
    code === "USD" ? (
      <span dir="ltr">${formatNumber(price)}</span>
    ) : (
      <span dir="ltr">
        {formatNumber(price)} {getCurrencySymbol()}
      </span>
    );

  return <span className={className}>{label}</span>;
}
