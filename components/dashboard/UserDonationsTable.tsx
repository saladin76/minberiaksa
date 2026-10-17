"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Receipt } from "lucide-react";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { dt } from "@/lib/dashboard/i18n";

type Outcome = "SUCCESS" | "PENDING" | "FAILED";
type Frequency = "DAILY" | "FRIDAY" | "MONTHLY";

interface DonationRow {
  id: string;
  outcome: Outcome;
  subscriptionId: string | null;
  frequency: Frequency | null;
  amount: number;
  amountUSD: number;
  currency: string;
  paymentMethod: "CARD" | "PAYPAL" | "BANK_TRANSFER" | null;
  createdAt: string;
  paidAt: string | null;
  campaigns: { id: string; title: string }[];
  categories: { id: string; name: string }[];
  referral: { id: string; code: string } | null;
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  get SUCCESS() { return dt("ناجح"); },
  get PENDING() { return dt("قيد التأكيد"); },
  get FAILED() { return dt("فشل"); },
};

const OUTCOME_CLASS: Record<Outcome, string> = {
  SUCCESS: "bg-green-100 text-green-700",
  PENDING: "bg-amber-100 text-amber-700",
  FAILED: "bg-red-100 text-red-700",
};

const FREQUENCY_LABEL: Record<Frequency, string> = {
  get DAILY() { return dt("يومي"); },
  get FRIDAY() { return dt("أسبوعياً"); },
  get MONTHLY() { return dt("شهري"); },
};

const METHOD_LABEL: Record<"CARD" | "PAYPAL" | "BANK_TRANSFER", string> = {
  get CARD() { return dt("بطاقة"); },
  PAYPAL: "PayPal",
  get BANK_TRANSFER() { return dt("تحويل بنكي"); },
};

/** Same date-over-time cell as the day-of-month drill-down, in Europe/Istanbul. */
function formatDateTime(value: string | null): { date: string; time: string } | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return {
    date: d.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "Europe/Istanbul" }),
    time: d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Europe/Istanbul",
    }),
  };
}

/**
 * Every donation of one donor, for the dashboard user-profile dialog. Laid out like
 * the «الوارد حسب يوم الشهر» drill-down so it reads as the same object. Defaults to
 * successful rows (the ones «الإجمالي» counts); «الكل» also shows unconfirmed and
 * failed attempts.
 */
export function UserDonationsTable({
  userId,
  formatMoney,
}: {
  userId: string;
  formatMoney: (value: number) => string;
}) {
  const [rows, setRows] = useState<DonationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/users/${userId}/donations`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || dt("تعذّر تحميل التبرعات"));
        return data;
      })
      .then((data) => {
        if (!cancelled) setRows(Array.isArray(data.rows) ? data.rows : []);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const successCount = useMemo(() => rows.filter((r) => r.outcome === "SUCCESS").length, [rows]);
  const visible = showAll ? rows : rows.filter((r) => r.outcome === "SUCCESS");

  return (
    <div className="rounded-md border border-border bg-muted/30">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Receipt className="w-3.5 h-3.5" />
          {dt("سجل التبرعات")}
        </h3>
        <div className="flex rounded-md border border-border bg-background p-0.5">
          {(
            [
              { all: false, label: dt("الناجحة"), count: successCount },
              { all: true, label: dt("الكل"), count: rows.length },
            ]
          ).map((opt) => (
            <button
              key={String(opt.all)}
              type="button"
              onClick={() => setShowAll(opt.all)}
              aria-pressed={showAll === opt.all}
              className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                showAll === opt.all ? "bg-brand text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label} <span className="tabular-nums opacity-80">({opt.count})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[320px] overflow-auto">
        {loading ? (
          <div className="py-10 text-center">
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-brand" />
          </div>
        ) : error ? (
          <EmptyState title={dt("تعذّر تحميل التبرعات")} description={error} className="m-3" />
        ) : visible.length === 0 ? (
          <EmptyState title={dt("لا توجد تبرعات")} className="m-3" />
        ) : (
          <table className="w-full text-xs text-start leading-snug">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-200 bg-slate-50/95 backdrop-blur">
                <th className="text-start py-2 px-3 text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                  {dt("التاريخ")}</th>
                <th className="text-start py-2 px-3 text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                  {dt("المبلغ")}</th>
                <th className="text-start py-2 px-3 text-[11px] font-semibold text-slate-500">
                  {dt("الحالة")}</th>
                <th className="text-start py-2 px-3 text-[11px] font-semibold text-slate-500">
                  {dt("المشروع / الفئة")}</th>
                <th className="text-start py-2 px-3 text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                  {dt("طريقة الدفع")}</th>
                <th className="text-start py-2 px-3 text-[11px] font-semibold text-slate-500">
                  {dt("الإحالة")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                // A settled row is dated by when the money landed; anything else by when it was attempted.
                const when = formatDateTime(r.paidAt ?? r.createdAt);
                const projects =
                  r.campaigns.length > 0
                    ? r.campaigns.map((c) => c.title).join(" · ")
                    : r.categories.map((c) => c.name).join(" · ");
                return (
                  <tr key={r.id} className="border-b border-slate-100 bg-background hover:bg-slate-50/60 transition-colors">
                    <td className="py-2 px-3 text-slate-600 tabular-nums whitespace-nowrap">
                      {when ? (
                        <div className="flex flex-col leading-tight">
                          <span>{when.date}</span>
                          <span className="text-[10px] text-slate-400" dir="ltr">{when.time}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <span className="font-semibold tabular-nums text-slate-900">
                        {r.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} {r.currency}
                      </span>
                      {r.currency !== "USD" && r.amountUSD > 0 ? (
                        <span className="block text-[10px] text-slate-500 tabular-nums">≈ {formatMoney(r.amountUSD)}</span>
                      ) : null}
                      <span className="block text-[10px] text-slate-500">
                        {r.frequency ? FREQUENCY_LABEL[r.frequency] : dt("مرة واحدة")}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <span className={`inline-block px-1.5 py-px rounded-full text-[11px] font-medium whitespace-nowrap ${OUTCOME_CLASS[r.outcome]}`}>
                        {OUTCOME_LABEL[r.outcome]}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-600 max-w-[180px]">
                      {projects ? (
                        <span className="block truncate" title={projects}>{projects}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                      {r.paymentMethod ? METHOD_LABEL[r.paymentMethod] : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                      {r.referral ? r.referral.code : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
