"use client";
import { useSession } from "next-auth/react";
import { userHasDashboardPermission } from "@/lib/dashboard/permissions";
import { dt } from "@/lib/dashboard/i18n";
import type { Ga4Period, Ga4Range } from "@/lib/marketing/ga4-period";
export function Ga4SeoEvidenceControl({ value, onChange }: { value: Ga4Period | null; onChange: (value: Ga4Period | null) => void }) {
  const { data: session } = useSession();
  if (!userHasDashboardPermission(session?.user, "platformConnections")) return null;
  return <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-slate-50 p-3 text-sm">
    <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked ? {range: "28d"} : null)} />{dt("استخدام بيانات GA4 في اقتراح SEO")}</label>
    {value && <><select aria-label={dt("فترة بيانات SEO")} value={value.range} onChange={(event) => onChange({range: event.target.value as Ga4Range})} className="rounded border bg-white p-2">
      <option value="today">{dt("اليوم")}</option><option value="yesterday">{dt("أمس")}</option><option value="7d">{dt("آخر 7 أيام")}</option><option value="28d">{dt("آخر 28 يومًا")}</option><option value="90d">{dt("آخر 90 يومًا")}</option><option value="180d">{dt("آخر 180 يومًا")}</option><option value="365d">{dt("آخر 365 يومًا")}</option><option value="custom">{dt("مخصص")}</option>
    </select>{value.range === "custom" && <><input aria-label={dt("من تاريخ")} type="date" value={value.startDate ?? ""} onChange={(event) => onChange({...value, startDate: event.target.value})} className="rounded border p-2" /><input aria-label={dt("إلى تاريخ")} type="date" value={value.endDate ?? ""} onChange={(event) => onChange({...value, endDate: event.target.value})} className="rounded border p-2" /></>}
    <span className="text-xs text-slate-500">{dt("تُقرأ أرقام الصفحة من الخادم عند إعداد الاقتراح، وتبقى التغييرات مسودة للمراجعة.")}</span></>}
  </div>;
}
