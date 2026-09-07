"use client";

import { useEffect, useState } from "react";
import { Loader2, CalendarRange } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/dashboard/EmptyState";

export type DayOfMonthMode = "collected" | "expected";

export interface DayOfMonthDetailFilters {
  categoryId?: string;
  campaignId?: string;
  userId?: string;
  referralId?: string;
}

interface DetailRow {
  id: string;
  subscriptionId: string | null;
  status: "ACTIVE" | "PAUSED" | "CANCELLED" | null;
  amount: number;
  amountUSD: number | null;
  currency: string;
  createdAt: string | null;
  nextBillingDate: string | null;
  lastBillingDate: string | null;
  paidAt: string | null;
  donor: { id: string; name: string | null; email: string | null } | null;
  campaigns: { id: string; title: string }[];
  categories: { id: string; name: string }[];
  referral: { id: string; code: string } | null;
}

type Props = {
  /** 1..31, or null when closed. */
  day: number | null;
  mode: DayOfMonthMode;
  filters?: DayOfMonthDetailFilters;
  formatMoney: (value: number) => string;
  onClose: () => void;
};

const STATUS_LABEL: Record<"ACTIVE" | "PAUSED" | "CANCELLED", string> = {
  ACTIVE: "نشط",
  PAUSED: "موقوف",
  CANCELLED: "ملغى",
};

const STATUS_CLASS: Record<"ACTIVE" | "PAUSED" | "CANCELLED", string> = {
  ACTIVE: "bg-green-100 text-green-700",
  PAUSED: "bg-amber-100 text-amber-700",
  CANCELLED: "bg-slate-100 text-slate-600",
};

/**
 * Date over time, matching the cell in the أحدث الدفعات الشهرية table so the two read
 * the same. Both parts are rendered in Europe/Istanbul — the timezone every other figure
 * on this page is bucketed by — and they share one locale so the digits don't switch
 * numeral systems halfway down the cell.
 */
function formatDateTime(value: string | null): { date: string; time: string } | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return {
    date: d.toLocaleDateString("en-US", {
      dateStyle: "medium",
      timeZone: "Europe/Istanbul",
    }),
    time: d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Europe/Istanbul",
    }),
  };
}

/**
 * The subscriptions / recurring payments behind one cell of «الوارد حسب يوم الشهر».
 *
 * Mirrors the قائمة الاشتراكات table so the drill-down reads as the same object the
 * admin already knows, with one column swapped per view: «تاريخ الدفع» when looking
 * at what was collected, «الدفعة القادمة» when looking at what is expected.
 */
export function DayOfMonthDetailsDialog({ day, mode, filters, formatMoney, onClose }: Props) {
  const [rows, setRows] = useState<DetailRow[]>([]);
  const [totals, setTotals] = useState<{ count: number; amountUSD: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (day == null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ day: String(day), mode });
    if (filters?.categoryId && filters.categoryId !== "all") params.set("categoryId", filters.categoryId);
    if (filters?.campaignId && filters.campaignId !== "all") params.set("campaignId", filters.campaignId);
    if (filters?.userId && filters.userId !== "all") params.set("userId", filters.userId);
    if (filters?.referralId) params.set("referralId", filters.referralId);

    fetch(`/api/admin/subscriptions/overview/day-of-month/details?${params}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "تعذّر تحميل التفاصيل");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setRows(Array.isArray(data.rows) ? data.rows : []);
        setTotals(data.totals ?? null);
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
  }, [day, mode, filters?.categoryId, filters?.campaignId, filters?.userId, filters?.referralId]);

  const isCollected = mode === "collected";

  return (
    <Dialog open={day != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        dir="rtl"
        className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0"
      >
        <DialogHeader className="px-5 py-4 border-b border-slate-100 text-right space-y-1">
          <DialogTitle className="flex items-center gap-2.5 text-base font-semibold text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand shrink-0">
              <CalendarRange className="h-4 w-4" />
            </span>
            {isCollected
              ? `ما تم تحصيله في اليوم ${day} من كل شهر`
              : `الاشتراكات التي تتجدّد في اليوم ${day} من كل شهر`}
          </DialogTitle>
          {totals && !loading ? (
            <div className="flex flex-wrap gap-4 pt-1.5">
              <span className="text-[11px] text-slate-500">
                العدد: <b className="text-slate-900 tabular-nums">{totals.count}</b>
              </span>
              <span className="text-[11px] text-slate-500">
                الإجمالي:{" "}
                <b className="text-slate-900 tabular-nums">{formatMoney(totals.amountUSD)}</b>
              </span>
            </div>
          ) : null}
        </DialogHeader>

        <div className="overflow-auto flex-1">
          {loading ? (
            <div className="py-16 text-center">
              <Loader2 className="w-7 h-7 animate-spin mx-auto text-brand" />
            </div>
          ) : error ? (
            <EmptyState title="تعذّر تحميل التفاصيل" description={error} className="m-5" />
          ) : rows.length === 0 ? (
            <EmptyState
              title="لا توجد بيانات لهذا اليوم"
              description={
                isCollected
                  ? "لم تُسدَّد أي دفعة شهرية في هذا اليوم من أي شهر."
                  : "لا يوجد اشتراك نشط مجدول للتجديد في هذا اليوم."
              }
              className="m-5"
            />
          ) : (
            <table className="w-full text-xs text-right leading-snug">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-200 bg-slate-50/95 backdrop-blur">
                  <th className="text-right py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    المشترك
                  </th>
                  <th className="text-right py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                    {isCollected ? "المبلغ" : "المبلغ الشهري"}
                  </th>
                  <th className="text-right py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    الحالة
                  </th>
                  <th className="text-right py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 max-w-[200px]">
                    المشروع / الفئة
                  </th>
                  <th className="text-right py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    الإحالة
                  </th>
                  <th className="text-right py-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                    {isCollected ? "تاريخ الدفع" : "الدفعة القادمة"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                    <td className="py-2.5 px-3">
                      <p className="font-medium text-slate-900 truncate max-w-[190px]">
                        {r.donor?.name?.trim() || "—"}
                      </p>
                      {r.donor?.email ? (
                        <p className="text-[10px] text-slate-500 truncate max-w-[190px]">{r.donor.email}</p>
                      ) : null}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="font-semibold tabular-nums text-slate-900">
                        {r.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} {r.currency}
                      </span>
                      {r.amountUSD != null && r.currency !== "USD" ? (
                        <span className="block text-[10px] text-slate-500 tabular-nums">
                          ≈ {formatMoney(r.amountUSD)}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 px-3">
                      {r.status ? (
                        <span
                          className={`inline-block px-1.5 py-px rounded-full text-[11px] font-medium ${STATUS_CLASS[r.status]}`}
                        >
                          {STATUS_LABEL[r.status]}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 max-w-[200px]">
                      {r.campaigns.length > 0 ? (
                        <span className="block truncate" title={r.campaigns.map((c) => c.title).join("، ")}>
                          {r.campaigns.map((c) => c.title).join("، ")}
                        </span>
                      ) : r.categories.length > 0 ? (
                        <span className="block truncate" title={r.categories.map((c) => c.name).join("، ")}>
                          فئة: {r.categories.map((c) => c.name).join("، ")}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                      {r.referral ? r.referral.code : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 tabular-nums whitespace-nowrap">
                      {(() => {
                        const dt = formatDateTime(isCollected ? r.paidAt : r.nextBillingDate);
                        if (!dt) return <span className="text-slate-400">—</span>;
                        return (
                          <div className="flex flex-col leading-tight">
                            <span>{dt.date}</span>
                            {/* dir="ltr" so "09:30 PM" can't get reordered by the RTL layout. */}
                            <span className="text-[10px] text-slate-400" dir="ltr">
                              {dt.time}
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
