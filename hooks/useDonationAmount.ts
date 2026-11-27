"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";
import { fetchGlobalSettings, getCachedGlobalSettings } from "@/lib/global-settings-client";
import { formatMoney } from "@/lib/minbar/money";
import {
  DEFAULT_MIN_DONATION,
  healLegacyLocalRows,
  lineLocal,
  minDonationFor,
  type LocalAmount,
  type MinDonationConfig,
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
  // The admin's floor (payment gateways page): a USD base and fixed figures per currency.
  const [minCfg, setMinCfg] = useState<MinDonationConfig>(() => getCachedGlobalSettings()?.minDonation ?? DEFAULT_MIN_DONATION);

  useEffect(() => {
    let live = true;
    fetchGlobalSettings().then((settings) => {
      if (live && settings) { setAllowAny(settings.allowAnyAmount); if (settings.minDonation) setMinCfg(settings.minDonation); }
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

  const fixedMin = minCfg.byCurrency[code];
  const minLocal = allowAny ? null : minDonationFor(code, rate, minCfg);
  const minLabel = minLocal == null ? "" : inLocal || fixedMin ? formatLocal(minLocal) : format(minCfg.usd);

  /* The floor applies to one-time gifts of a free amount only (owner, 2026-11-27):
     recurring gifts and share projects (price per share set on the project) are exempt. */
  const tooSmall = useCallback(
    (usd: number, local?: LocalAmount, opts?: { frequency?: string | null; shares?: boolean }) => {
      if (allowAny || !(usd > 0)) return false;
      if (opts?.shares || (opts?.frequency && opts.frequency !== "once")) return false;
      if (local && minLocal != null && local.currency === code) return local.amount < minLocal - 1e-6;
      if (fixedMin && inLocal) return usd * (rate as number) < fixedMin - 1e-6;
      return usd < minCfg.usd - 1e-6;
    },
    [allowAny, minLocal, code, fixedMin, inLocal, rate, minCfg.usd]
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
      const row = item as { freqKey?: string | null; shareCount?: number | null };
      if ((row.freqKey && row.freqKey !== "once") || row.shareCount) return false;
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
