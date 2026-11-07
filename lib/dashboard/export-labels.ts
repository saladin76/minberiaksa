import { dashIntl, dt } from "@/lib/dashboard/report-i18n";

const regionNames = new Map<string, Intl.DisplayNames>();
const languageNames = new Map<string, Intl.DisplayNames>();

/** Report labels never infer a donor's country from their phone or IP. */
export function exportCountryName(code: string | null | undefined): string {
  const normalized = code?.trim().toUpperCase();
  if (!normalized || !/^[A-Z]{2}$/.test(normalized) || ["XX", "ZZ"].includes(normalized)) return dt("غير محدد");
  const region = normalized === "UK" ? "GB" : normalized === "EL" ? "GR" : normalized;
  const locale = dashIntl("ar");
  try {
    let names = regionNames.get(locale);
    if (!names) {
      names = new Intl.DisplayNames([locale], { type: "region", fallback: "none" });
      regionNames.set(locale, names);
    }
    return names.of(region) || dt("غير محدد");
  } catch {
    return dt("غير محدد");
  }
}

export function exportLanguageName(code: string | null | undefined): string {
  if (!code?.trim() || code === "__unset") return dt("غير محدد");
  const locale = dashIntl("ar");
  try {
    let names = languageNames.get(locale);
    if (!names) {
      names = new Intl.DisplayNames([locale], { type: "language", fallback: "none" });
      languageNames.set(locale, names);
    }
    return names.of(code.trim().replaceAll("_", "-")) || dt("غير محدد");
  } catch {
    return dt("غير محدد");
  }
}

export function exportPaymentStatus(status: string, paidAt?: Date | null): string {
  if (status === "PAID") return paidAt ? dt("ناجح") : dt("قيد التأكيد");
  if (status === "FAILED") return dt("فاشل");
  if (status === "PENDING") return dt("قيد التأكيد");
  if (status === "CANCELLED") return dt("ملغي");
  if (status === "REFUNDED") return dt("مسترد");
  if (status === "PARTIALLY_REFUNDED") return dt("مسترد جزئيًا");
  return dt("غير محدد");
}

export function exportPaymentMethod(method: string | null | undefined): string {
  if (!method) return dt("غير محدد");
  const normalized = method.toUpperCase();
  if (["CARD", "CREDIT_CARD", "DEBIT_CARD"].includes(normalized)) return dt("بطاقة ائتمان");
  if (["BANK", "BANK_TRANSFER"].includes(normalized)) return dt("تحويل بنكي");
  if (normalized === "PAYPAL") return "PayPal";
  if (normalized === "CASH") return dt("نقدًا");
  return method;
}
