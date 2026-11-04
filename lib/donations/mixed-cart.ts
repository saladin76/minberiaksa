import type { CartFreqKeyLike, OrderType } from "./recurring-schedule";

const ORDER_CADENCE: Record<OrderType, CartFreqKeyLike> = {
  ONE_TIME: "once", DAILY: "daily", FRIDAY: "friday", MONTHLY: "monthly",
};

/** Wire order is campaigns, categories, then waqf, matching the three line lists.
 * Legacy callers without line metadata retain the whole-order cadence. */
export function checkoutLineFrequencies(type: string, raw: unknown, count: number): CartFreqKeyLike[] {
  if (!Object.hasOwn(ORDER_CADENCE, type)) throw new Error("MIXED_DONATION_FREQUENCIES");
  const expected = ORDER_CADENCE[type as OrderType];
  if (raw === undefined) return Array.from({ length: count }, () => expected);
  if (!Array.isArray(raw) || raw.length !== count || raw.some(value => value !== "once" && value !== expected)
    || (expected !== "once" && !raw.includes(expected))) throw new Error("MIXED_DONATION_FREQUENCIES");
  return raw as CartFreqKeyLike[];
}

type Amount = { amount: number };
export function recurringCheckoutLines<A extends Amount, B extends Amount, C extends Amount>(
  groups: { items: readonly A[]; categoryItems: readonly B[]; waqfItems: readonly C[] },
  frequencies: readonly CartFreqKeyLike[],
) {
  const count = groups.items.length + groups.categoryItems.length + groups.waqfItems.length;
  if (frequencies.length !== count) throw new Error("MIXED_DONATION_FREQUENCIES");
  const items = groups.items.filter((_, i) => frequencies[i] !== "once");
  const categoryItems = groups.categoryItems.filter((_, i) => frequencies[groups.items.length + i] !== "once");
  const waqfItems = groups.waqfItems.filter((_, i) => frequencies[groups.items.length + groups.categoryItems.length + i] !== "once");
  return { items, categoryItems, waqfItems, amount: [...items, ...categoryItems, ...waqfItems].reduce((sum, line) => sum + line.amount, 0) };
}
