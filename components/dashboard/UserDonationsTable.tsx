"use client";

import { useEffect, useState } from "react";
import { Loader2, Receipt } from "lucide-react";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { dt } from "@/lib/dashboard/i18n";
import { DonationFinancialStatus } from "./DonationFinancialStatus";
import type { DonationFinancialSummary } from "@/lib/dashboard/donation-financial-summary";

import { SUBSCRIPTION_LIFECYCLE_LABELS, type SubscriptionLifecycle } from "@/lib/donations/subscription-lifecycle";

type DonorSubscription = { id: string; status: string; lifecycle: SubscriptionLifecycle; activated: boolean; frequency: Frequency; amount: number; currency: string; provider: string; lastBillingDate: string | null; nextBillingDate: string | null; chargeAttempts: number; lastChargeError: string | null; projects: string[] };

type Outcome = "SUCCESS" | "PENDING" | "FAILED";
type Frequency = "DAILY" | "FRIDAY" | "MONTHLY";

interface DonationRow {
  id: string;
  outcome: Outcome;
  financialSummary?: DonationFinancialSummary | null;
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

const FREQUENCY_LABEL: Record<Frequency, string> = {
  get DAILY() { return dt("يومي"); },
  get FRIDAY() { return dt("تبرع كل جمعة"); },
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
  const [subscriptions, setSubscriptions] = useState<DonorSubscription[]>([]);
  const [kind, setKind] = useState<"all" | "once" | "recurring">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRows([]);
    setSubscriptions([]);
    setError(null);
    fetch(`/api/users/${userId}/donations`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || dt("تعذّر تحميل التبرعات"));
        return data;
      })
      .then((data) => {
        if (!cancelled) {
          setRows(Array.isArray(data.rows) ? data.rows : []);
          setSubscriptions(Array.isArray(data.subscriptions) ? data.subscriptions : []);
        }
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

  const selectedRows = rows.filter(row => kind === "all" || (kind === "recurring" ? Boolean(row.subscriptionId) : !row.subscriptionId));
  const successCount = selectedRows.filter(row => row.outcome === "SUCCESS").length;
  const visible = showAll ? selectedRows : selectedRows.filter((r) => r.outcome === "SUCCESS");
  const planOf = new Map(subscriptions.map(plan => [plan.id, plan]));

  return (
    <div className="space-y-3">
      <section className="rounded-md border border-border bg-muted/30 p-3" aria-label={dt("الاشتراكات الدورية")}>
        <h3 className="text-xs font-semibold mb-2">{dt("الاشتراكات الدورية")}</h3>
        {loading ? <p className="text-xs text-muted-foreground">{dt("جاري التحميل…")}</p> : error ? <p role="alert" className="text-xs text-red-700">{error}</p> : !subscriptions.length ? <p className="text-xs text-muted-foreground">{dt("لا توجد اشتراكات دورية")}</p> : <div className="grid gap-2">
          {subscriptions.map(plan => <div key={plan.id} className="rounded border bg-background p-3 text-xs space-y-1.5">
            <div className="flex flex-wrap justify-between gap-2"><strong>{FREQUENCY_LABEL[plan.frequency]} · <span dir="ltr">{plan.amount} {plan.currency}</span></strong><span className={plan.lifecycle === "ACTIVE" ? "text-emerald-700" : plan.lifecycle === "PAYMENT_FAILED" ? "text-red-700" : "text-amber-800"}>{dt(SUBSCRIPTION_LIFECYCLE_LABELS[plan.lifecycle])}</span></div>
            <p className="text-muted-foreground">{plan.projects.join(" · ")} · {plan.provider}</p>
            {!plan.activated && <p>{dt("لم تنجح أول دفعة؛ هذه محاولة اشتراك وليست اشتراكًا نشطًا.")}</p>}
            {plan.lastBillingDate && <p>{dt("آخر دفعة مؤكدة")}: {formatDateTime(plan.lastBillingDate)?.date}</p>}
            {plan.lifecycle === "ACTIVE" && plan.nextBillingDate && <p>{dt("التجديد القادم")}: {formatDateTime(plan.nextBillingDate)?.date}</p>}
            {plan.lifecycle === "PAYMENT_FAILED" && <p>{plan.status === "ACTIVE" ? dt("إعادة المحاولة مجدولة؛ يحتاج متابعة الفريق.") : dt("توقفت المحاولات؛ يحتاج متابعة الفريق.")}</p>}
            {plan.lastChargeError && <p dir="auto" className="break-words rounded bg-red-50 p-2 text-red-700">{dt("سبب التعثر")}: {plan.lastChargeError}</p>}
            {!plan.lastChargeError && plan.lifecycle === "PAYMENT_FAILED" && <p>{dt("سبب التعثر غير مسجل؛ راجع تفاصيل بوابة الدفع.")}</p>}
          </div>)}
        </div>}
      </section>
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
              { all: true, label: dt("الكل"), count: selectedRows.length },
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

      <div className="flex flex-wrap gap-2 p-2" aria-label={dt("نوع التبرع")}>
        {([ ["all", "كل التبرعات"], ["once", "مرة واحدة"], ["recurring", "دوري"] ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)} className={`rounded border px-3 py-1 text-xs ${kind === value ? "bg-brand text-white" : "bg-background"}`}>{dt(label)}</button>)}
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
                      {r.subscriptionId && planOf.get(r.subscriptionId) && <span className="block text-[10px] text-amber-800">{dt(SUBSCRIPTION_LIFECYCLE_LABELS[planOf.get(r.subscriptionId)!.lifecycle])}</span>}
                    </td>
                    <td className="py-2 px-3">
                      <DonationFinancialStatus donation={{status:r.outcome === "FAILED" ? "FAILED" : "PAID",paidAt:r.paidAt,financialSummary:r.financialSummary}} />
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
    </div>
  );
}
