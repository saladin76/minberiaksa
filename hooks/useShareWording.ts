"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import type { MinbarProjectShares } from "@/lib/minbar/projects";

/**
 * Wording for a سهوم (shares) campaign: "3 shares", "$50 per share",
 * "12 of 40 shares".
 *
 * The unit is the campaign's own name for it in this locale when the admin
 * set one (`Campaign.shareLabels`, e.g. خروف / خراف), otherwise the generic
 * share / shares. Counts are formatted by the caller so digits follow the
 * locale like every other figure on the page.
 */
export function useShareWording(shares: MinbarProjectShares | null = null) {
  const t = useTranslations("ProjectShares");

  const unitWordFor = useCallback(
    (of: MinbarProjectShares | null, count: number) => {
      if (of?.unit) return count === 1 ? of.unit.singular : of.unit.plural;
      return t(count === 1 ? "unitSingular" : "unitPlural");
    },
    [t]
  );

  /** "3 shares" / "3 خراف" for any campaign's shares. The generic form goes through ICU plurals. */
  const countLabelFor = useCallback(
    (of: MinbarProjectShares | null, count: number, formatted: string) =>
      of?.unit ? t("countWithUnit", { count: formatted, unit: unitWordFor(of, count) }) : t("count", { count }),
    [t, unitWordFor]
  );

  const unitWord = useCallback((count: number) => unitWordFor(shares, count), [shares, unitWordFor]);
  const countLabel = useCallback(
    (count: number, formatted: string) => countLabelFor(shares, count, formatted),
    [shares, countLabelFor]
  );

  return { t, unitWord, countLabel, unitWordFor, countLabelFor };
}

/**
 * Shares given so far and, for a campaign with a target, how many the target
 * is. Derived from the money figures: the campaign stores amounts, and a
 * share is always exactly its price.
 */
export function shareProgress(
  shares: MinbarProjectShares,
  raisedUSD: number,
  goalUSD: number | null
): { sold: number; total: number | null } {
  /* The epsilon keeps float noise (3 × 33.3333…) from dropping a whole share. */
  const sold = Math.max(0, Math.floor(raisedUSD / shares.priceUSD + 1e-9));
  const total = goalUSD != null && goalUSD > 0 ? Math.max(1, Math.ceil(goalUSD / shares.priceUSD - 1e-9)) : null;
  return { sold, total };
}
