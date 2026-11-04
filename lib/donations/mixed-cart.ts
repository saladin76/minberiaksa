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

/** Server-created link between two accounting records paid by one bank sale. */
export function mixedCheckoutPayment(raw: unknown): { oneTimeDonationId: string; totalAmount: number } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = (raw as Record<string, unknown>).mixedCheckout;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const link = value as Record<string, unknown>;
  return typeof link.oneTimeDonationId === "string" && /^[a-f0-9]{24}$/i.test(link.oneTimeDonationId)
    && typeof link.totalAmount === "number" && Number.isFinite(link.totalAmount) && link.totalAmount > 0
    ? { oneTimeDonationId: link.oneTimeDonationId, totalAmount: link.totalAmount } : null;
}
export function mixedCheckoutParent(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const id = (raw as Record<string, unknown>).mixedCheckoutParentId;
  return typeof id === "string" ? id : null;
}
export function validMixedCheckoutPair(parent: { id: string; donorId: string; currency: string; totalAmount: number; subscriptionId?: string | null; providerRaw?: unknown }, child: { id: string; donorId: string; currency: string; totalAmount: number; subscriptionId?: string | null; providerRaw?: unknown } | null): boolean {
  const link = mixedCheckoutPayment(parent.providerRaw);
  return Boolean(link && parent.subscriptionId && child && child.id !== parent.id && child.id === link.oneTimeDonationId
    && !child.subscriptionId && mixedCheckoutParent(child.providerRaw) === parent.id && child.donorId === parent.donorId
    && child.currency === parent.currency && Math.abs(parent.totalAmount + child.totalAmount - link.totalAmount) < 0.011);
}
