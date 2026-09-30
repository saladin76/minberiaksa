"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";
import { fetchGlobalSettings, getCachedGlobalSettings } from "@/lib/global-settings-client";
import { formatMoney } from "@/lib/minbar/money";
import {
  MIN_DONATION_USD,
  healLegacyLocalRows,
  lineLocal,
  minDonationInCurrency,
  type LocalAmount,
} from "@/lib/minbar/donation-amount";
import type { MinbarCartItem } from "@/lib/minbar/cart";

type Line = Pick<MinbarCartItem, "amount" | "local"> & { currency?: string };

/**
 * Donation amounts in the visitor's currency  what an amount box means and
 * whether it is enough. See `lib/minbar/donation-amount.ts`.
 *
 *  - `fromLocal(value)` / `fromChip(chip)` turn a figure in the visitor's
 *    currency (typed, or an admin's per-currency preset) into what a cart line
 *    stores: its USD value, and the exact figure when the visitor is not in USD.
 *  - `tooSmall(usd, local?)` is the $1 floor, off when the admin allows any
 *    amount; `minLabel` says what the floor is in the visitor's currency.
 *  - `lineValue` / `formatLine` / `lineTooSmall` read a cart line back in the
 *    visitor's currency, exact when it was given in it.
 */
export function useDonationAmount() {
  const locale = useLocale();
  const { code, rate, format, formatLocal } = useMinbarMoney();
  const [allowAny, setAllowAny] = useState<boolean>(() => getCachedGlobalSettings()?.allowAnyAmount ?? false);

  useEffect(() => {
    let live = true;
    fetchGlobalSettings().then((settings) => {
      if (live && settings) setAllowAny(settings.allowAnyAmount);
    });
    return () => {
      live = false;
    };
  }, []);

  const inLocal = code !== "USD" && rate != null && rate > 0;

  const fromLocal = useCallback(
    (value: number): { usd: number; local?: LocalAmount } => {
      if (!(value > 0)) return { usd: 0 };
      if (!inLocal) return { usd: value };
      return { usd: value / (rate as number), local: { amount: value, currency: code } };
    },
    [inLocal, rate, code]
  );

  /** An amount chip (`PriceChip`): exact when it is the admin's local figure. */
  const fromChip = useCallback(
    (chip: { usd: number; local?: number } | null | undefined, times = 1): { usd: number; local?: LocalAmount } => {
      if (!chip) return { usd: 0 };
      return chip.local != null ? fromLocal(chip.local * times) : { usd: chip.usd * times };
    },
    [fromLocal]
  );

  /** How an amount reads to the donor: the exact figure when there is one. */
  const labelOf = useCallback(
    (given: { usd: number; local?: LocalAmount }) =>
      given.local && given.local.currency === code ? formatLocal(given.local.amount) : format(given.usd),
    [code, format, formatLocal]
  );

  const minLocal = allowAny ? null : minDonationInCurrency(code, rate);
  const minLabel = minLocal == null ? "" : inLocal ? formatLocal(minLocal) : format(MIN_DONATION_USD);

  const tooSmall = useCallback(
    (usd: number, local?: LocalAmount) => {
      if (allowAny || !(usd > 0)) return false;
      if (local && minLocal != null && local.currency === code) return local.amount < minLocal;
      return usd < MIN_DONATION_USD - 1e-6;
    },
    [allowAny, minLocal, code]
  );

  /** A line's amount in the visitor's currency, exact when it was given in it. */
  const lineValue = useCallback(
    (item: Line) => {
      const local = lineLocal({ ...item, amount: item.amount });
      if (local && local.currency === code) return local.amount;
      return inLocal ? item.amount * (rate as number) : item.amount;
    },
    [code, inLocal, rate]
  );

  const formatLine = useCallback(
    (item: Line) => {
      const local = lineLocal(item);
      if (local && local.currency === code) return formatLocal(local.amount);
      // A figure in a currency the visitor has since left: shown as it was given.
      if (local && !item.local) return formatMoney(local.amount, local.currency, locale);
      return format(item.amount);
    },
    [code, format, formatLocal, locale]
  );

  /** A cart line is below the floor (waqf is priced by the server, not checked). */
  const lineTooSmall = useCallback(
    (item: Line & Pick<MinbarCartItem, "waqf">) => {
      if (item.waqf) return false;
      const local = lineLocal(item);
      // A legacy row in another currency has no USD value to check here.
      if (local && !item.local && local.currency !== code) return false;
      return tooSmall(local && !item.local ? local.amount / (rate || 1) : item.amount, local);
    },
    [tooSmall, code, rate]
  );

  return { allowAny, fromLocal, fromChip, labelOf, tooSmall, lineTooSmall, minLocal, minLabel, lineValue, formatLine, inLocal, code, rate };
}

/**
 * Rewrites basket rows that store a figure in the visitor's currency directly
 * into the USD + exact-figure form, once the rate is known. Mounted by the
 * basket and the checkout, where the totals are read.
 */
export function useHealLegacyRows(
  items: MinbarCartItem[],
  replace: (next: MinbarCartItem[]) => void,
  hydrated: boolean
) {
  const { code, rate } = useMinbarMoney();
  useEffect(() => {
    if (!hydrated) return;
    const healed = healLegacyLocalRows(items, code, rate);
    if (healed) replace(healed);
  }, [items, code, rate, hydrated, replace]);
}
