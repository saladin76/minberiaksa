import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Donations are inserted with status='PAID' *before* the gateway confirms, so an
 * abandoned checkout leaves a row with status=PAID and no `paidAt`. Revenue means
 * settled money, so those rows are filtered out — for one-time AND subscription
 * donations alike.
 *
 * History: subscription-linked rows used to get lenient treatment (`status='PAID'`
 * alone, via `OR: [{paidAt: {not: null}}, {subscriptionId: {not: null}}]`). That
 * existed because the Stripe webhook was never registered, so renewals never got a
 * `paidAt` and every monthly donation would otherwise have shown as قيد التأكيد.
 *
 * That justification is gone: the webhook is live and 74 of 76 paid subscription
 * donations carry a `paidAt`. The two that don't were verified against Stripe —
 * neither has a Stripe subscription or a paid invoice, so neither ever charged.
 *
 * The leniency was also actively harmful. Wherever it was composed onto a base that
 * already required `subscriptionId != null`, its `paidAt` arm became vacuous — the
 * OR read "paidAt set OR subscriptionId set" while the base guaranteed the second
 * arm — so the settlement guard silently disappeared and unsettled rows counted as
 * revenue. That is exactly why /dashboard and /dashboard/monthly disagreed.
 *
 * Kept as a separate export from `PAID_CONTRIBUTING_FILTER` (rather than deleted)
 * because ~18 call sites import it and the two names document different intents:
 * this one is dashboard/list semantics, that one is campaign currentAmount math.
 */
export const PAID_DONATION_FILTER: Prisma.DonationWhereInput = {
  status: "PAID",
  paidAt: { not: null },
};

/**
 * Strict version — only donations that actually moved money into a campaign.
 * Used by the campaign/category `currentAmount` recompute helpers so we never
 * double-count an optimistic subscription sentinel against totals the webhook
 * will still increment when it lands.
 */
export const PAID_CONTRIBUTING_FILTER: Prisma.DonationWhereInput = {
  status: "PAID",
  paidAt: { not: null },
};

/** Single-row USD value for stats when `amountUSD` was never backfilled. */
export function donationRowUsdApprox(row: {
  amountUSD: number | null;
  amount: number;
  currency: string;
}): number {
  if (typeof row.amountUSD === "number" && Number.isFinite(row.amountUSD) && row.amountUSD > 0) {
    return row.amountUSD;
  }
  if (row.currency === "USD" && typeof row.amount === "number" && Number.isFinite(row.amount)) {
    return row.amount;
  }
  return 0;
}

/**
 * When aggregate `_sum.amountUSD` is 0 but paid rows exist, Prisma sum ignored nulls —
 * recompute from rows (USD fallback on `amount` when currency is USD).
 */
export async function donationUsdRevenueFallback(
  where: Prisma.DonationWhereInput
): Promise<{ total: number; oneTime: number; monthly: number }> {
  const rows = await prisma.donation.findMany({
    where,
    select: { amountUSD: true, amount: true, currency: true, subscriptionId: true },
  });
  let total = 0;
  let oneTime = 0;
  let monthly = 0;
  for (const r of rows) {
    const u = donationRowUsdApprox(r);
    total += u;
    if (r.subscriptionId) monthly += u;
    else oneTime += u;
  }
  return { total, oneTime, monthly };
}

export async function donationUsdSumFallback(where: Prisma.DonationWhereInput): Promise<number> {
  const rows = await prisma.donation.findMany({
    where,
    select: { amountUSD: true, amount: true, currency: true },
  });
  return rows.reduce((s, r) => s + donationRowUsdApprox(r), 0);
}
