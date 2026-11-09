"use client";
import { useCallback, useEffect, useState } from "react";
type Case = { id: string; revision: number; phase: string; failedAttempts: number; until: number | null; lastEventAt: number };
export default function DonationFraudReview() {
  const [rows, setRows] = useState<Case[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/site-security/fraud", { cache: "no-store" });
    if (!response.ok) throw new Error("تعذر تحميل قائمة الحظر الأمني");
    const body = await response.json() as { rows: Case[]; truncated?: boolean };
    setRows(body.rows);
    setTruncated(Boolean(body.truncated));
  }, []);
  useEffect(() => { void load().catch((e: Error) => setError(e.message)); }, [load]);
  async function release(row: Case) {
    if (busy) return;
    if (reason.trim().length < 10) { setError("اكتب سبب رفع الحظر بوضوح (10 أحرف على الأقل)."); return; }
    if (!window.confirm("تأكيد رفع الحظر عن هذه الجلسة بعد مراجعة السجلات؟")) return;
    setBusy(row.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/site-security/fraud", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id, expectedRevision: row.revision, reason: reason.trim(),
          confirmation: "RELEASE_FRAUD_BLOCK",
        }),
      });
      if (!response.ok) throw new Error(response.status === 409
        ? "تم تغيير الحالة أثناء المراجعة، أعد التحميل."
        : "لم يتم اعتماد رفع الحظر.");
      setNotice("تم تسجيل رفع الحظر.");
      setReason("");
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }
  return (
    <section className="rounded-xl border bg-white p-4" aria-label="حالات الاشتباه في التبرعات">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">محاولات الدفع المقيّدة والمشبوهة</h2>
        <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => void load().catch((e: Error) => setError(e.message))}>تحديث</button>
      </div>
      <p className="mt-2 text-sm text-slate-600">الحالات المجهولة أو قيد تأكيد البنك لا تُحسب تلقائيًا محاولات فاشلة. المعرفات مشفّرة، ولا تُعرض بيانات البطاقة.</p>
      <label className="mt-3 block text-sm font-medium" htmlFor="fraud-release-reason">سبب رفع الحظر</label>
      <textarea id="fraud-release-reason" className="mt-1 w-full rounded-lg border p-2 text-sm" value={reason} onChange={e => setReason(e.target.value)} maxLength={300} rows={2} />
      <div className="mt-3 space-y-2">
        {!rows.length && <p className="rounded-lg bg-slate-50 p-3 text-sm">لا توجد حالات معروضة حاليًا.</p>}
        {rows.map(row => (
          <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
            <div>
              <strong className="text-sm">{row.id.slice(0, 12)}…</strong>
              <p className="text-xs text-slate-600">{row.phase === "REVIEW_BLOCK" ? "حظر يستلزم مراجعة إدارية" : "انتظار مؤقت"} · فشل مؤكد: {row.failedAttempts}</p>
              {row.until && <p className="text-xs text-slate-600">الحد الأدنى / نهاية الانتظار: {new Date(row.until).toLocaleString("ar")}</p>}
            </div>
            <button type="button" disabled={busy !== null} onClick={() => void release(row)}
              className="rounded-lg border border-rose-400 px-3 py-2 text-sm font-medium text-rose-800 disabled:opacity-40">رفع التقييد</button>
          </div>
        ))}
        {truncated && <p className="text-xs text-amber-700">القائمة تعرض أول 100 حالة فقط. يلزم ترشيح أو تصدير للمراجعة الكاملة.</p>}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="mt-2 text-sm text-emerald-700">{notice}</p>}
    </section>
  );
}
