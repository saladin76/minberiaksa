import type { BasketCurrency, BasketItem, BasketTotals } from "@/types/basket";

export type BasketDocument = {
  id: "general" | "zakat" | "waqf" | "gift" | "recurring";
  title: string;
  description: string;
};

export type BasketCurrencyTotal = {
  currency: BasketCurrency;
  amount: number;
};

export const frequencyLabels: Record<string, string> = {
  daily: "يومي",
  friday: "كل جمعة",
  monthly: "شهري",
  "يومي": "يومي",
  "كل جمعة": "كل جمعة",
  "شهري": "شهري",
};

export const getFrequencyLabel = (value?: string) => value ? frequencyLabels[value] ?? value : "غير محددة";
export const formatBasketAmount = (amount: number) => amount.toLocaleString("en-US", { maximumFractionDigits: 3 });

export function calculateCurrencyTotals(items: BasketItem[]): BasketCurrencyTotal[] {
  const totals = new Map<BasketCurrency, number>();
  items.forEach((item) => {
    if (item.available === false || !Number.isFinite(item.amount) || item.amount <= 0) return;
    totals.set(item.currency, (totals.get(item.currency) ?? 0) + item.amount);
  });
  return [...totals.entries()].map(([currency, amount]) => ({ currency, amount }));
}

export function calculateBasketTotals(items: BasketItem[]): BasketTotals {
  const recurringPlans = items.filter((item) => item.intent === "recurring" || item.donationMode === "recurring");
  const recurringIds = new Set(recurringPlans.map((item) => item.id));
  const oneTimeItems = items.filter((item) => !recurringIds.has(item.id) && item.available !== false);
  const zakatAmount = oneTimeItems.filter((item) => item.intent === "zakat").reduce((sum, item) => sum + item.amount, 0);
  const waqfAmount = oneTimeItems.filter((item) => item.intent === "waqf").reduce((sum, item) => sum + item.amount, 0);
  const giftAmount = oneTimeItems.filter((item) => item.intent !== "zakat" && item.intent !== "waqf" && item.donationMode === "gift").reduce((sum, item) => sum + item.amount, 0);
  const generalOneTimeAmount = oneTimeItems.filter((item) => item.intent !== "zakat" && item.intent !== "waqf" && item.donationMode !== "gift").reduce((sum, item) => sum + item.amount, 0);
  const oneTimeAmount = oneTimeItems.reduce((sum, item) => sum + item.amount, 0);
  return { oneTimeAmount, zakatAmount, waqfAmount, giftAmount, generalOneTimeAmount, amountDueNow: oneTimeAmount, recurringPlans };
}

export function getIntentionCounts(items: BasketItem[]) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = item.intent === "general" && item.donationMode === "gift" ? "إهداء" : item.intentLabel;
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

export function getBasketDocuments(items: BasketItem[]): BasketDocument[] {
  const documents: BasketDocument[] = [];
  if (items.some((item) => item.intent !== "zakat" && item.intent !== "waqf" && item.intent !== "recurring" && item.donationMode !== "gift")) documents.push({ id: "general", title: "إيصال تبرع", description: "إيصال عام للعناصر غير المخصصة للزكاة أو الوقف." });
  if (items.some((item) => item.intent === "zakat")) documents.push({ id: "zakat", title: "إيصال زكاة", description: "يبقى منفصلًا عن بقية النيات." });
  if (items.some((item) => item.intent === "waqf")) documents.push({ id: "waqf", title: "شهادة وقف", description: "تصدر عند اعتمادها وإتاحتها فعليًا." });
  if (items.some((item) => item.donationMode === "gift")) documents.push({ id: "gift", title: "بطاقة إهداء", description: "مرتبطة ببيانات الإهداء عند توفرها." });
  if (items.some((item) => item.intent === "recurring" || item.donationMode === "recurring")) documents.push({ id: "recurring", title: "ملخص خطة عطاء مستمر", description: "الدورية والوجهة والتقديرات المسجلة." });
  return documents;
}

export function maskEmail(value?: string) {
  if (!value || !value.includes("@")) return "غير مضاف";
  const [name, domain] = value.split("@");
  return `${name.slice(0, 1)}***@${domain}`;
}

export function recurringEstimates(frequency: string | undefined, amount: number) {
  if (frequency === "daily" || frequency === "يومي") return { monthly: amount * 30, annual: amount * 365 };
  if (frequency === "friday" || frequency === "كل جمعة") return { monthly: amount * 4.33, annual: amount * 52 };
  return { monthly: amount, annual: amount * 12 };
}
