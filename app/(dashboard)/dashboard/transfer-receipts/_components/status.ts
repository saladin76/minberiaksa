import type { BankTransferClaimStatus } from "@prisma/client";

/**
 * The finance queue's vocabulary — one place for the label, the tone and the
 * plain-language hint of each state, so the tab, the card pill and the dialog
 * header cannot drift apart.
 */

export type ClaimStatus = BankTransferClaimStatus;

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  UNDER_REVIEW: "بانتظار المراجعة",
  AWAITING_RECEIPT: "بانتظار الإيصال",
  REJECTED: "مرفوض",
  CONFIRMED: "مؤكد",
};

export const CLAIM_STATUS_HINTS: Record<ClaimStatus, string> = {
  UNDER_REVIEW: "رفع المتبرع إيصالًا ويحتاج إلى قرار: طابقه مع كشف الحساب ثم أكّد أو ارفض.",
  AWAITING_RECEIPT: "سجّل المتبرع الطلب واختار التحويل البنكي ولم يرفع إيصالًا بعد.",
  REJECTED: "رُفض الإيصال وأُبلغ المتبرع بالسبب. يمكنه رفع إيصال آخر ما دامت المحاولات متاحة.",
  CONFIRMED: "طُوبق التحويل واحتُسب التبرع في الإجماليات وأُرسل الإيصال الرسمي.",
};

export const CLAIM_STATUS_PILL: Record<ClaimStatus, string> = {
  UNDER_REVIEW: "border-amber-200 bg-amber-50 text-amber-800",
  AWAITING_RECEIPT: "border-slate-200 bg-slate-50 text-slate-600",
  REJECTED: "border-rose-200 bg-rose-50 text-rose-700",
  CONFIRMED: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export const CLAIM_STATUS_DOT: Record<ClaimStatus, string> = {
  UNDER_REVIEW: "bg-amber-500",
  AWAITING_RECEIPT: "bg-slate-400",
  REJECTED: "bg-rose-500",
  CONFIRMED: "bg-emerald-500",
};

/** Reasons that cover almost every rejection; one click fills the box, still editable. */
export const REJECTION_PRESETS: string[] = [
  "لم يصل أي تحويل بهذا المبلغ إلى الحساب حتى الآن",
  "المبلغ في الإيصال لا يطابق مبلغ الطلب",
  "الإيصال غير واضح أو غير مكتمل — يرجى رفع صورة أوضح أو مستند التحويل من تطبيق البنك",
  "اسم المُرسل في الإيصال لا يمكن مطابقته مع الحساب",
  "الإيصال لا يخص حسابًا من حساباتنا البنكية",
];

const rtf = new Intl.RelativeTimeFormat("ar", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

export function relativeTime(iso: string): string {
  const diff = (Date.parse(iso) - Date.now()) / 1000;
  const abs = Math.abs(diff);
  for (const [unit, secs] of UNITS) {
    if (abs >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return "الآن";
}

export function absoluteDate(iso: string, style: "medium" | "long" = "medium"): string {
  return new Date(iso).toLocaleString("ar-EG", { dateStyle: style, timeStyle: "short" });
}

export function dateOnly(iso: string): string {
  return new Date(iso).toLocaleDateString("ar-EG", { dateStyle: "medium" });
}

/** Days a receipt has been waiting; the queue's urgency signal. */
export function waitingDays(iso: string): number {
  return Math.floor((Date.now() - Date.parse(iso)) / (24 * 3600 * 1000));
}

export function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toLocaleString("en")} ${currency}`;
  }
}

export function usd(amount: number | null): string | null {
  if (amount == null) return null;
  return `≈ $${Math.round(amount).toLocaleString("en")}`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
