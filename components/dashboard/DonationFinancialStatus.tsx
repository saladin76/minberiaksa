"use client";

import type { DonationFinancialSummary } from "@/lib/dashboard/donation-financial-summary";
import { dt } from "@/lib/dashboard/i18n";

export type FinancialStatusDonation = { status?: string | null; paidAt?: string | null; securityMode?: string | null; financialSummary?: DonationFinancialSummary | null };
export function DonationFinancialStatus({ donation, onFailure }: { donation: FinancialStatusDonation; onFailure?: () => void }) {
  const summary = donation.financialSummary;
  const adjusted = summary && summary.state !== "PAID";
  const labels = { REFUNDED: dt("مسترد بالكامل"), PARTIALLY_REFUNDED: dt("مسترد جزئيًا"), VOIDED: dt("ملغاة لدى البنك"), REVIEW_REQUIRED: dt("تحتاج مراجعة مالية"), PAID: dt("ناجح") };
  const label = adjusted ? labels[summary.state] : donation.status === "FAILED" ? dt("فاشل") : donation.paidAt && donation.status === "PAID" ? dt("ناجح") : dt("قيد التأكيد");
  const color = adjusted ? "bg-violet-100 text-violet-800" : donation.status === "FAILED" ? "bg-red-100 text-red-700" : donation.paidAt && donation.status === "PAID" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700";
  const content = <>{label}{donation.securityMode ? <bdi dir="ltr">{` ${donation.securityMode}`}</bdi> : null}</>;
  const money = (minor: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: summary?.currency || "USD" }).format(minor/100);
  return <span className="inline-flex flex-col gap-1">
    {donation.status === "FAILED" && onFailure ? <button type="button" className={`inline-flex w-max items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-medium ${color}`} onClick={onFailure} title={dt("عرض رسالة الخطأ من بوابة الدفع")}>{content}</button> : <span className={`inline-flex w-max items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-medium ${color}`}>{content}</span>}
    {adjusted && summary.returnedMinor != null && summary.remainingMinor != null && summary.currency ? <small className="text-[10px] text-slate-500">{dt("المسترد")}: <bdi>{money(summary.returnedMinor)}</bdi> · {dt("المتبقي")}: <bdi>{money(summary.remainingMinor)}</bdi></small> : null}
  </span>;
}
