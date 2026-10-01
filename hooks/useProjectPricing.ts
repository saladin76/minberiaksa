"use client";

import { useMemo } from "react";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";
import type { MinbarProject, MinbarProjectShares } from "@/lib/minbar/projects";

/** A quick-pick amount: what the basket stores (USD) and what the donor reads. */
export interface PriceChip {
  usd: number;
  label: string;
  /** The admin's figure in the visitor's currency, when that is what this is. */
  local?: number;
}

/**
 * Per-campaign prices for the visitor's currency.
 *
 * The basket stores USD and every other figure is converted for display. An
 * admin can also set amounts (and a share price) in a specific currency
 * `suggestedDonations.byCurrency`, `suggestedShareCounts.priceByCurrency`. For
 * a visitor in that currency those are shown exactly as typed, and stored as
 * their USD equivalent at the same rate the page displays with, so the
 * figure the donor picked is the figure they see in the basket.
 *
 * `card`: the campaign card's three chips  the first three of the visitor's
 * per-currency list when there is one, else the card picks
 * (`MinbarProject.cardAmounts`). The campaign page passes nothing and gets
 * the whole list.
 */
export function useProjectPricing(project: MinbarProject, fallbackAmounts: readonly number[], { card = false }: { card?: boolean } = {}) {
  const { format, formatLocal, code, rate } = useMinbarMoney();

  const chips = useMemo<PriceChip[]>(() => {
    const local = project.suggestedAmountsByCurrency?.[code];
    if (local?.length && rate && rate > 0) {
      return (card ? local.slice(0, 3) : local).map((value) => ({ usd: value / rate, label: formatLocal(value), local: value }));
    }
    const usd = card ? project.cardAmounts : project.suggestedAmounts?.length ? project.suggestedAmounts : fallbackAmounts;
    return usd.map((value) => ({ usd: value, label: format(value) }));
  }, [project.suggestedAmountsByCurrency, project.suggestedAmounts, project.cardAmounts, card, fallbackAmounts, code, rate, format, formatLocal]);

  const sharePrice = useMemo(() => sharePriceFor(project.shares, code, rate, format, formatLocal), [project.shares, code, rate, format, formatLocal]);

  return { chips, sharePrice };
}

/**
 * The price of one share for this visitor: the admin's price in their
 * currency when there is one, else the USD price converted.
 */
export function sharePriceFor(
  shares: MinbarProjectShares | null,
  code: string,
  rate: number | null,
  format: (usd: number) => string,
  formatLocal: (value: number) => string
): PriceChip | null {
  if (!shares) return null;
  const override = shares.priceByCurrency?.[code];
  if (override && override > 0 && rate && rate > 0) return { usd: override / rate, label: formatLocal(override), local: override };
  return { usd: shares.priceUSD, label: format(shares.priceUSD) };
}
