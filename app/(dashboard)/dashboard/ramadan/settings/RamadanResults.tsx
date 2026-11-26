"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { readDashboardJson } from "@/lib/dashboard/read-json";
import { dt, dtMaybe } from "@/lib/dashboard/i18n";
import { withLatn } from "@/lib/i18n/latn";
import type { RamadanStats } from "@/lib/minbar/ramadan-stats";

type Results = {
  stats: Omit<RamadanStats, "projects"> & { projects: { id: string; title: string | null; total: number }[] };
  recent: { id: string; createdAt: string; donor: string | null; days: number; total: number; slot: "fajr" | "maghrib"; state: "confirmed" | "awaitingCard" | "stopped" | "ended" | "abandoned" }[];
};
const money = (v: number) => "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: v % 1 ? 2 : 0 }).format(v);
const STATE_CLASS: Record<Results["recent"][number]["state"], string> = {
  confirmed: "bg-emerald-50 text-emerald-800", awaitingCard: "bg-amber-50 text-amber-800", stopped: "bg-red-50 text-red-800", ended: "bg-slate-100 text-slate-700", abandoned: "bg-slate-100 text-slate-500",
};

/** Results of Ramadan scheduling, above the settings: real plans and charges, refreshed on demand. */
export function RamadanResults() {
  const [data, setData] = useState<Results | null>(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setError("");
    void readDashboardJson<Results>("/api/admin/ramadan-stats", controller.signal).then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? dtMaybe(e.message) : dt("تعذر تحميل نتائج جدولة رمضان")); });
    return () => controller.abort();
  }, [attempt]);
  const stateLabel = { confirmed: dt("مؤكدة"), awaitingCard: dt("بانتظار تحقق البطاقة"), stopped: dt("متوقفة لفشل السحب"), ended: dt("منتهية"), abandoned: dt("لم تكتمل") };
  const s = data?.stats, max = s ? Math.max(1, ...s.perDay) : 1;
  const kpis = s ? [
    [dt("جداول مؤكدة"), String(s.confirmed)], [dt("بانتظار تحقق البطاقة"), String(s.awaitingCard)], [dt("متبرعون"), String(s.donors)],
    [dt("إجمالي المبالغ المجدولة"), money(s.scheduledTotal)], [dt("تم تحصيله"), money(s.collected)], [dt("سحوبات فاشلة"), String(s.failedCharges)],
  ] : [];
  return <Card className="space-y-5 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-bold">{dt("نتائج جدولة رمضان")}</h2><p className="mt-1 text-sm text-slate-500">{dt("من الجداول والسحوبات الفعلية في قاعدة البيانات")}</p></div>
      <Button type="button" variant="outline" onClick={() => setAttempt(v => v + 1)}><RefreshCw className="me-2 h-4 w-4" />{dt("تحديث")}</Button>
    </div>
    {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    {!s && !error ? <p role="status" className="p-6 text-center text-sm text-slate-500">{dt("جارٍ التحميل…")}</p> : null}
    {s ? <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map(([label, value]) => <div key={label} className="rounded-xl border bg-slate-50/60 p-4"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-2xl font-bold tabular-nums">{value}</div></div>)}
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">{dt("المتوقع سحبه في كل يوم من رمضان")}</h3>
        <div role="img" aria-label={dt("المتوقع سحبه في كل يوم من رمضان")} className="flex h-36 items-end gap-1 rounded-xl border p-3" dir="ltr">
          {s.perDay.map((v, i) => <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${i + 1}: ${money(v)}`}><div className={i >= 20 ? "w-full rounded-t bg-amber-500" : "w-full rounded-t bg-rose-800"} style={{ height: `${Math.max(v ? 6 : 2, (v / max) * 100)}px`, opacity: v ? 1 : 0.15 }} /><span className="text-[10px] text-slate-500">{i + 1}</span></div>)}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border p-4"><h3 className="mb-2 text-sm font-semibold">{dt("موعد التبرع اليومي")}</h3><p className="text-sm">{dt("بعد الفجر")}: <b className="tabular-nums">{s.slot.fajr}</b></p><p className="text-sm">{dt("قبيل المغرب")}: <b className="tabular-nums">{s.slot.maghrib}</b></p></div>
        <div className="rounded-xl border p-4"><h3 className="mb-2 text-sm font-semibold">{dt("النية")}</h3><p className="text-sm">{dt("عن نفسه")}: <b className="tabular-nums">{s.intent.self}</b></p><p className="text-sm">{dt("عن والديه")}: <b className="tabular-nums">{s.intent.parents}</b></p><p className="text-sm">{dt("عن غيره")}: <b className="tabular-nums">{s.intent.other}</b></p></div>
        <div className="rounded-xl border p-4"><h3 className="mb-2 text-sm font-semibold">{dt("المتوقع لكل مشروع")}</h3>{s.projects.length ? s.projects.map(p => <p key={p.id} className="flex justify-between gap-3 text-sm"><span className="min-w-0 truncate">{p.title || dt("مشروع لم يعد منشورًا")}</span><b className="tabular-nums">{money(p.total)}</b></p>) : <p className="text-sm text-slate-500">—</p>}</div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">{dt("آخر الجداول")}</h3>
        {data!.recent.length ? <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500"><tr><th className="p-3 text-start">{dt("التاريخ")}</th><th className="p-3 text-start">{dt("المتبرع")}</th><th className="p-3 text-start">{dt("الأيام")}</th><th className="p-3 text-start">{dt("الإجمالي")}</th><th className="p-3 text-start">{dt("الموعد")}</th><th className="p-3 text-start">{dt("الحالة")}</th></tr></thead>
          <tbody>{data!.recent.map(r => <tr key={r.id} className="border-t"><td className="p-3 tabular-nums">{new Intl.DateTimeFormat(withLatn("ar"), { dateStyle: "medium", timeStyle: "short" }).format(new Date(r.createdAt))}</td><td className="p-3">{r.donor || "—"}</td><td className="p-3 tabular-nums">{r.days}</td><td className="p-3 tabular-nums">{money(r.total)}</td><td className="p-3">{r.slot === "fajr" ? dt("بعد الفجر") : dt("قبيل المغرب")}</td><td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATE_CLASS[r.state]}`}>{stateLabel[r.state]}</span></td></tr>)}</tbody>
        </table></div> : <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">{dt("لا توجد جداول بعد. ستظهر هنا فور تأكيد أول متبرع جدولته.")}</p>}
      </div>
    </> : null}
  </Card>;
}
