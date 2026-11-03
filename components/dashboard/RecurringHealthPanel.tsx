"use client";
import type { RenewalEvidence } from "@/lib/donations/renewal-evidence";
import { useEffect, useState } from "react";
import { Activity, ChevronDown, RefreshCw } from "lucide-react";
import { BILLING_READINESS_LABELS, type BillingReadiness } from "@/lib/donations/recurring-readiness";
import { dt, dashIntl } from "@/lib/dashboard/i18n";
import type { RecurringScheduleSnapshot } from "@/lib/donations/recurring-schedule-snapshot";
type Health = { renewals?: RenewalEvidence; schedule?: RecurringScheduleSnapshot; schedulerState?: "never" | "failed" | "stale" | "recent" | "unconfirmed"; checkedAt: string; complete: boolean; groups: { provider: string; frequency: string; total: number; readiness: Partial<Record<BillingReadiness, number>>; failed: number }[]; providers: Record<string, { enabled: boolean; signupReady: boolean }>; lastCheck: { createdAt: string; messageAr: string } | null };
export function RecurringHealthPanel() {
  const [health, setHealth] = useState<Health | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const load = async () => { setBusy(true); setError(""); try { const response = await fetch("/api/admin/subscriptions/health", { cache: "no-store" }); if (!response.ok) throw new Error(); setHealth(await response.json()); } catch { setError(dt("تعذر تحميل جاهزية التجديد. أعد المحاولة.")); } finally { setBusy(false); } };
  useEffect(() => { void load(); }, []);
  return <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm" data-recurring-readiness>
    <summary className="flex min-h-16 cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
      <span className="flex items-center gap-2 font-bold text-slate-800"><Activity size={18} />{dt("جاهزية التجديد الفعلية")}</span>
      <span className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
        {health?.schedule ? <><span>{dt("دفعات مجدولة")}: <b className="text-slate-900">{health.schedule.counts.scheduled || 0}</b></span><span>{dt("مستحقة الآن")}: <b className="text-slate-900">{health.schedule.counts.due || 0}</b></span></> : null}
        {error || health && (!health.complete || health.schedulerState !== "recent") ? <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-800">{dt("تحتاج مراجعة")}</span> : null}
        <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
      </span>
    </summary>
    <div className="space-y-3 border-t p-4 sm:p-5">
    <div className="flex justify-end"><button type="button" disabled={busy} onClick={load} className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-xs disabled:opacity-50"><RefreshCw size={14} className={busy ? "animate-spin" : ""} />{dt("تحديث الفحص")}</button></div>
    <p className="text-xs leading-6 text-slate-500">{dt("الفحص يقرأ إعدادات الخادم والدفعات المؤكدة فقط. الاشتراك النشط لا يصبح قابلًا للتجديد دون أول دفعة وتفويض دفع وموعد صالح؛ اكتمال إعدادات البوابة لا يثبت قبول البنك للخصم.")}</p>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    {health ? <>
      {health.schedule ? <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">{[
        [dt("دفعات مجدولة"), health.schedule.counts.scheduled || 0], [dt("مستحقة الآن"), health.schedule.counts.due || 0],
        [dt("تحتاج ضبط الموعد"), (health.schedule.counts.schedule_missing || 0) + (health.schedule.counts.schedule_invalid || 0) + (health.schedule.counts.billing_history_missing || 0)],
        [dt("خلال 24 ساعة"), health.schedule.next24Hours],
      ].map(([label, count]) => <div key={String(label)} className="rounded-xl border bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><strong className="mt-2 block text-xl">{count}</strong></div>)}</div> : null}
      {health.schedule?.nextScheduledAt ? <p className="text-sm text-emerald-800">{dt("أقرب موعد قادم")}: {new Date(health.schedule.nextScheduledAt).toLocaleString(dashIntl("ar-EG"), { timeZone: "Europe/Istanbul" })}</p> : null}
      {health.schedulerState && health.schedulerState !== "recent" ? <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-800">{schedulerWarning(health.schedulerState)}</p> : null}
      {health.renewals ? <div className="space-y-2 rounded-xl border p-3"><h3 className="text-sm font-bold">{dt("إثبات التجديد التلقائي خلال آخر 30 يومًا")}</h3><p className="text-xs leading-6 text-slate-500">{dt("هذه الأرقام تخص الخصم بعد أول دفعة فقط. نجاح الاشتراك الأول لا يثبت نجاح التجديد.")}</p>{health.renewals.groups.length ? health.renewals.groups.map(group => <div key={group.provider + group.frequency} className={`rounded-lg border p-3 text-xs ${group.confirmed === 0 || group.unresolved || group.declined || group.notCollected ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}><p className="font-bold">{group.provider} · {dt(group.frequency === "MONTHLY" ? "شهري" : group.frequency === "DAILY" ? "يومي" : "كل جمعة")}</p><p className="mt-1">{dt("تجديدات مؤكدة")}: {group.confirmed} · {dt("تجديدات مرفوضة")}: {group.declined} · {dt("لم يتم التحصيل دون رفض بنكي مؤكد")}: {group.notCollected || 0} · {dt("نتائج غير محسومة")}: {group.unresolved}</p>{group.latestConfirmedAt ? <p>{dt("آخر تجديد مؤكد")}: {new Date(group.latestConfirmedAt).toLocaleString(dashIntl("ar-EG"), { timeZone: "Europe/Istanbul" })}</p> : <p className="mt-1 font-semibold">{dt("لا يوجد تجديد ناجح مثبت في هذه الفترة.")}</p>}{group.lastDeclineCode ? <p>{dt("آخر رمز رفض")}: <bdi>{group.lastDeclineCode}</bdi></p> : null}</div>) : <p className="text-xs text-amber-800">{dt("لا توجد محاولات تجديد مسجلة في هذه الفترة؛ القبول البنكي لم يُثبت بعد.")}</p>}{!health.renewals.complete ? <p className="text-xs text-amber-800">{dt("العينة محدودة بآخر 1000 محاولة؛ راجع التقرير الكامل قبل اعتماد النتيجة.")}</p> : null}</div> : null}
      <div className="flex flex-wrap gap-2">{Object.entries(health.providers).map(([name, config]) => <span key={name} className={`rounded-lg border px-3 py-2 text-xs ${config.enabled && config.signupReady ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{name} · {config.enabled && config.signupReady ? dt("الإعدادات مكتملة") : dt("الإعدادات تحتاج مراجعة")}</span>)}</div><details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">{dt("تفصيل الأهلية حسب البوابة والدورية")}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{health.groups.map(group => <div key={group.provider + group.frequency} className="space-y-2 rounded-lg bg-slate-50 p-3 text-xs"><h3 className="font-bold">{group.provider} · {dt(group.frequency === "DAILY" ? "يومي" : group.frequency === "FRIDAY" ? "كل جمعة" : "شهري")} ({group.total})</h3>{Object.entries(group.readiness).map(([reason, count]) => <p className="flex justify-between gap-2" key={reason}><span>{dt(BILLING_READINESS_LABELS[reason as BillingReadiness])}</span><b>{count}</b></p>)}{group.failed ? <p className="text-red-700">{dt("تعذّر الخصم")}: {group.failed}</p> : null}</div>)}</div></details><p className="text-xs text-slate-500">{dt("آخر فحص")}: {new Date(health.checkedAt).toLocaleString(dashIntl("ar-EG"), { timeZone: "Europe/Istanbul" })}</p>{health.lastCheck ? <p className="text-xs leading-6 text-slate-500">{dt("آخر نتيجة جدولة مسجلة")}: {new Date(health.lastCheck.createdAt).toLocaleString(dashIntl("ar-EG"), { timeZone: "Europe/Istanbul" })} · {health.lastCheck.messageAr}</p> : <p className="text-xs text-amber-700">{dt("لا توجد نتيجة جدولة مسجلة بعد؛ افحص تثبيت cron وسجل تشغيله.")}</p>}{!health.complete ? <p className="text-xs text-amber-800">{dt("الفحص محدود؛ لم تُقرأ جميع الاشتراكات.")}</p> : null}</> : busy ? <p role="status" className="text-xs text-slate-500">{dt("جار الفحص…")}</p> : null}
    </div>
  </details>;
}

function schedulerWarning(state: string) {
  if (state === "failed") return dt("آخر تشغيل للمجدوِل أخفق؛ راجع سجل التشغيل قبل اعتبار الدفعات فعالة.");
  if (state === "stale") return dt("لم يُسجّل تشغيل حديث للمجدوِل خلال 40 دقيقة؛ المواعيد المحفوظة وحدها لا تثبت التنفيذ.");
  return dt("تشغيل المجدوِل غير مؤكد من السجل الحالي.");
}
