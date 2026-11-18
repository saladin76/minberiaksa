/**
 * Service renewals (owner, 2026-11-18): the paid services the site depends on, when each renews,
 * and how urgent it is. Pure and dependency-free: shared by the dashboard, the API and tests.
 */
export type RenewalCycle = "MONTHLY" | "YEARLY" | "ONCE";
export type RenewalLevel = "NONE" | "SOON" | "NEAR" | "URGENT" | "OVERDUE" | "NO_DATE";
export type ServiceRenewal = {
  id: string;
  name: string;
  provider: string;
  /** YYYY-MM-DD, or null until someone enters it. */
  renewsAt: string | null;
  cycle: RenewalCycle;
  amount: number | null;
  currency: string | null;
  /** Last four digits only — never a full card number. */
  cardLast4: string | null;
  owner: string | null;
  billingUrl: string | null;
  notes: string | null;
  /** Read automatically (e.g. the site's TLS certificate); not confirmed by hand. */
  auto?: "SSL";
  lastConfirmedAt: string | null;
};

const DAY = 86_400_000;
export const isCycle = (v: unknown): v is RenewalCycle => v === "MONTHLY" || v === "YEARLY" || v === "ONCE";
export const isIsoDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z"));
const todayUtc = (now: Date) => Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

/** Whole days from today to the renewal date (negative once it has passed). */
export function daysLeft(renewsAt: string, now = new Date()): number {
  return Math.round((Date.parse(renewsAt + "T00:00:00Z") - todayUtc(now)) / DAY);
}

/** 14 days: soon · 7: near · 3 or less: urgent · past the date and not confirmed: overdue. */
export function renewalLevel(item: Pick<ServiceRenewal, "renewsAt">, now = new Date()): RenewalLevel {
  if (!item.renewsAt) return "NO_DATE";
  const d = daysLeft(item.renewsAt, now);
  if (d < 0) return "OVERDUE";
  if (d <= 3) return "URGENT";
  if (d <= 7) return "NEAR";
  if (d <= 14) return "SOON";
  return "NONE";
}

/** After a confirmed renewal: the next date in the cycle that is still ahead (ONCE: no next date). */
export function nextRenewal(renewsAt: string, cycle: RenewalCycle, now = new Date()): string | null {
  if (cycle === "ONCE") return null;
  const [y, m, d] = renewsAt.split("-").map(Number);
  let year = y, month = m - 1;
  const step = () => { if (cycle === "MONTHLY") { month += 1; if (month > 11) { month = 0; year += 1; } } else year += 1; };
  const at = () => { const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate(); return Date.UTC(year, month, Math.min(d, last)); };
  step();
  while (at() <= todayUtc(now)) step();
  return new Date(at()).toISOString().slice(0, 10);
}

/** Alerts worth showing on the dashboard, most urgent first. */
export function dueRenewals(items: ServiceRenewal[], now = new Date()): Array<ServiceRenewal & { level: RenewalLevel; days: number | null }> {
  const rank: Record<RenewalLevel, number> = { OVERDUE: 0, URGENT: 1, NEAR: 2, SOON: 3, NO_DATE: 9, NONE: 9 };
  return items
    .map((i) => ({ ...i, level: renewalLevel(i, now), days: i.renewsAt ? daysLeft(i.renewsAt, now) : null }))
    .filter((i) => i.level !== "NONE" && i.level !== "NO_DATE")
    .sort((a, b) => rank[a.level] - rank[b.level] || (a.days ?? 0) - (b.days ?? 0));
}

/** The services the site was found to depend on (dates and amounts are entered by the team). */
export const DEFAULT_SERVICES: Array<Pick<ServiceRenewal, "name" | "provider" | "cycle" | "billingUrl" | "notes"> & { auto?: "SSL" }> = [
  { name: "الخادم (VPS)", provider: "Radore", cycle: "MONTHLY", billingUrl: "https://www.radore.com", notes: "يتوقف الموقع كاملاً إن انتهى." },
  { name: "النطاق minberiaksa.org", provider: "مسجّل النطاق", cycle: "YEARLY", billingUrl: null, notes: "يتوقف الموقع والبريد إن انتهى." },
  { name: "قاعدة البيانات", provider: "MongoDB Atlas", cycle: "MONTHLY", billingUrl: "https://cloud.mongodb.com", notes: "كل بيانات التبرعات والمتبرعين." },
  { name: "الصور والملفات", provider: "Cloudinary", cycle: "MONTHLY", billingUrl: "https://console.cloudinary.com", notes: "تختفي صور الموقع إن توقف." },
  { name: "البريد الإلكتروني", provider: "Elastic Email", cycle: "MONTHLY", billingUrl: "https://app.elasticemail.com", notes: "الإيصالات والشهادات وحملات البريد." },
  { name: "واتساب للأعمال", provider: "Meta", cycle: "MONTHLY", billingUrl: "https://business.facebook.com/billing_hub", notes: "رصيد الرسائل وطريقة الدفع في Meta." },
  { name: "الذكاء الاصطناعي", provider: "OpenAI", cycle: "MONTHLY", billingUrl: "https://platform.openai.com/settings/organization/billing", notes: "الترجمة الآلية والمساعد." },
  { name: "أسعار الصرف", provider: "ExchangeRate-API", cycle: "MONTHLY", billingUrl: "https://app.exchangerate-api.com", notes: "تحويل العملات في صفحات التبرع." },
  { name: "شهادة الأمان SSL", provider: "Let's Encrypt (تلقائي)", cycle: "ONCE", billingUrl: null, notes: "تُقرأ تلقائياً من الموقع، وتتجدد آلياً.", auto: "SSL" },
];
