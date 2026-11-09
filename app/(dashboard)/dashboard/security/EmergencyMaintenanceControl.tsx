"use client";
import { useEffect, useState } from "react";

type Status = { enabled: boolean; revision: number; reason: string; updatedAt: string | null };
export default function EmergencyMaintenanceControl() {
  const [status, setStatus] = useState<Status | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function refresh() {
    const response = await fetch("/api/admin/site-security/maintenance", { cache: "no-store" });
    if (!response.ok) throw new Error("تعذر التحقق من حالة الصيانة");
    setStatus(await response.json() as Status);
  }
  useEffect(() => { void refresh().catch((e: Error) => setError(e.message)); }, []);
  async function change(enabled: boolean) {
    if (!status || busy) return;
    if (reason.trim().length < 10) { setError("اكتب سبب الإجراء (10 أحرف على الأقل)."); return; }
    const confirmation = enabled ? "ENABLE_MAINTENANCE" : "DISABLE_MAINTENANCE";
    if (!window.confirm(enabled
      ? "سيُغلق الموقع العام ومسارات إنشاء التبرعات فورًا. ستبقى لوحة الإدارة وإشعارات البنوك متاحة. هل تؤكد؟"
      : "سيُفتح الموقع للزوار مرة أخرى. هل تؤكد إنهاء الصيانة؟")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/site-security/maintenance", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, expectedRevision: status.revision, reason: reason.trim(), confirmation }),
      });
      if (!response.ok) throw new Error(response.status === 409
        ? "تم تغيير الحالة بواسطة مسؤول آخر. أعد تحميل الحالة قبل أي إجراء."
        : "تعذر تنفيذ الإجراء. لم يتم تأكيد أي تغيير.");
      setStatus(await response.json() as Status);
      setNotice(enabled ? "تم تفعيل الصيانة الطارئة." : "تم تعطيل وضع الصيانة.");
      setReason("");
    } catch (e) { setError((e as Error).message); void refresh().catch(() => {}); }
    finally { setBusy(false); }
  }
  return (
    <section className={`rounded-xl border-2 p-4 sm:p-5 ${status?.enabled ? "border-rose-400 bg-rose-50" : "border-amber-300 bg-amber-50"}`} aria-label="وضع الصيانة الطارئ">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">وضع الصيانة الأمنية الطارئ</h2>
          <p className="mt-1 text-sm">إيقاف الموقع العام وإنشاء مدفوعات جديدة، مع استمرار لوحة الإدارة وإشعارات مزودي الدفع والتجديدات القائمة.</p>
        </div>
        <strong className="rounded-lg bg-white px-3 py-2 text-sm">
          {status ? (status.enabled ? "الصيانة مفعلة" : "الموقع مفتوح") : "جارٍ فحص الحالة"}
        </strong>
      </div>
      {status?.updatedAt && <p className="mt-2 text-xs">آخر تغيير: {new Date(status.updatedAt).toLocaleString("ar")} · مراجعة {status.revision}</p>}
      <label htmlFor="emergency-maintenance-reason" className="mt-4 block text-sm font-medium">سبب الإجراء (يسجل في سجل التدقيق)</label>
      <textarea id="emergency-maintenance-reason" rows={2} maxLength={300} value={reason} onChange={e => setReason(e.target.value)}
        placeholder="مثال: إيقاف مؤقت بعد اكتشاف حملة محاولات دفع مشبوهة" className="mt-1 w-full rounded-lg border bg-white p-2 text-sm" />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={!status || busy || status.enabled} onClick={() => void change(true)}
          className="rounded-lg bg-rose-700 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">تفعيل الصيانة الطارئة</button>
        <button type="button" disabled={!status || busy || !status.enabled} onClick={() => void change(false)}
          className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">إعادة فتح الموقع</button>
        <button type="button" disabled={busy} onClick={() => void refresh().catch((e: Error) => setError(e.message))}
          className="rounded-lg border bg-white px-4 py-2 text-sm">تحديث الحالة</button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-rose-800">{error}</p>}
      {notice && <p role="status" className="mt-3 text-sm font-semibold text-emerald-800">{notice}</p>}
      <p className="mt-3 text-xs text-slate-600">لا يجري استرجاع أو إلغاء أي دفعة تلقائيًا. هذه الأداة لا تستبدل فصل الموقع من مزود الاستضافة عند حدوث اختراق للبنية التحتية.</p>
    </section>
  );
}
