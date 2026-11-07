"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { dt, dashIntl } from "@/lib/dashboard/i18n";
import type { BankOperation } from "@/lib/donations/bank-operations-core";
import { DONATION_FINANCIAL_UPDATED } from "@/hooks/useLiveDonationRefresh";

type Details = { sale: { provider: string; orderId: string; reference: string | null; amountMinor: number; currency: string }; operations: BankOperation[]; returnedMinor: number; remainingMinor: number; blocked: boolean; voided: boolean; confirmed: boolean; canManage: boolean; ready: { ready: boolean; reason?: string }; inquiry?: { state: string; code: string; at: string; inspection?: { verified: boolean }; data?: Record<string, unknown> } };
const label = (state: string) => state === "SUCCEEDED" ? dt("مؤكد لدى البنك") : state === "DECLINED" ? dt("رفضه البنك") : state === "PENDING" ? dt("قيد المعالجة") : dt("نتيجة غير مؤكدة — تحتاج مطابقة");
function errorText(code: string) {
  const messages: Record<string, string> = {
    BANK_NOT_CONFIGURED: dt("إعدادات واجهة البنك غير مكتملة؛ يلزم تأكيد عنوان API وصلاحيات الإلغاء والاسترداد والاستعلام."),
    TERMINAL_MISMATCH: dt("الطرفية الحالية تختلف عن طرفية العملية الأصلية. راجع إعدادات البنك."),
    SALE_REFERENCE_REQUIRED: dt("مرجع العملية الأصلي غير مكتمل. يلزم مطابقته مع البنك."),
    SALE_AMOUNT_REQUIRED: dt("المبلغ والعملة الأصليان لدى البنك غير مثبتين في السجل."),
    INVALID_AMOUNT: dt("أدخل مبلغًا صحيحًا أكبر من صفر وبحد أقصى منزلتين عشريتين."),
    AMOUNT_EXCEEDS_REMAINING: dt("المبلغ يتجاوز المتبقي القابل للاسترداد. حدّث السجل."),
    OPERATION_PENDING_REVIEW: dt("توجد عملية معلقة؛ تحقّق من البنك وطابق نتيجتها قبل طلب إجراء آخر."),
    NOTHING_TO_RETURN: dt("لا يوجد مبلغ متبقٍ قابل للاسترداد."),
    VOID_AFTER_REFUND: dt("سُجل استرداد سابق. استخدم استرداد المتبقي بدل الإلغاء."),
    STALE_OPERATION: dt("تغيرت حالة العملية. حدّث السجل وتحقق من البنك قبل المتابعة."),
    IDEMPOTENCY_CONFLICT: dt("هذا الطلب مسجل ببيانات مختلفة. حدّث السجل قبل المتابعة."),
    BANK_BALANCE_UNVERIFIED: dt("لم يؤكد الاستعلام هوية العملية ومبلغها ورصيد الاسترداد. راجع البنك قبل تنفيذ أي إجراء."),
    BANK_BALANCE_MISMATCH: dt("رصيد الاسترداد لدى البنك لا يطابق النتيجة المطلوبة. يلزم التحقق والمطابقة قبل المتابعة."),
    CURRENCY_MISMATCH: dt("عملة الطلب تختلف عن عملة التحصيل الأصلية. حدّث السجل قبل المتابعة."),
  };
  return messages[code] || dt("تعذّر تأكيد النتيجة. حدّث السجل وتحقق من البنك قبل تكرار الطلب.");
}
export function DonationBankOperations({ donationId }: { donationId: string }) {
  const [data, setData] = useState<Details | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [action, setAction] = useState<"VOID" | "REFUND" | null>(null);
  const [amount, setAmount] = useState(""), [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [resolution, setResolution] = useState<BankOperation | null>(null), [evidence, setEvidence] = useState(""), [succeeded, setSucceeded] = useState<boolean | null>(null);
  const [notice, setNotice] = useState("");
  const [historyLimit, setHistoryLimit] = useState(20);
  // Keep the same key after a lost HTTP response; even a double click cannot resend money.
  const request = useRef<{ key: string; signature: string } | null>(null), inFlight = useRef(false), generation = useRef(0);
  const url = `/api/admin/donations/${donationId}/bank-operations`;
  const load = useCallback(async (signal?: AbortSignal) => {
    const current = generation.current;
    const res = await fetch(url, { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000) }), body = await res.json();
    if (!res.ok) throw new Error(body.error || "UNAVAILABLE");
    if (!signal?.aborted && current === generation.current) setData(body);
  }, [url]);
  useEffect(() => {
    const abort = new AbortController(); const effectGeneration = ++generation.current; inFlight.current = false; setBusy(false); setHistoryLimit(20); setData(null); setError(""); setNotice(""); setAction(null); setResolution(null); setConfirmed(false); setAmount(""); setReason(""); request.current = null;
    void load(abort.signal).catch(err => { if (!abort.signal.aborted) setError(errorText(err.message)); });
    return () => { abort.abort(); generation.current = effectGeneration + 1; };
  }, [load]);
  async function send(payload: Record<string, unknown>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setNotice(""); const current = generation.current;
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await res.json(); if (current !== generation.current) return;
      if (!res.ok) throw new Error(body.error || "UNAVAILABLE");
      setNotice(label(body.operation?.state || (body.inquiry?.inspection?.verified ? body.inquiry.state : "UNKNOWN")));
      setAction(null); setResolution(null); setConfirmed(false); request.current = null;
      await load();
    } catch (err) { if (current === generation.current) { setConfirmed(false); setAction(null); setResolution(null); setError(errorText(err instanceof Error ? err.message : "UNAVAILABLE")); await load().catch(() => {}); } }
    finally { if (current === generation.current) { inFlight.current = false; setBusy(false); window.dispatchEvent(new CustomEvent(DONATION_FINANCIAL_UPDATED, { detail: { donationId } })); } }
  }
  function execute() {
    if (!action || !confirmed) return;
    const signature = `${action}:${amount}:${reason}`;
    if (!request.current || request.current.signature !== signature) request.current = { key: crypto.randomUUID(), signature };
    void send({ action, amount, currency: data?.sale.currency, reason, confirmed, key: request.current.key });
  }
  const money = (minor: number) => new Intl.NumberFormat(dashIntl("ar-EG"), { style: "currency", currency: data?.sale.currency || "USD" }).format(minor / 100);
  const button = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50";
  const input = "w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-sm";
  if (!data) return <section className="space-y-2 rounded-xl border p-3"><h3 className="text-sm font-bold">{dt("إدارة العملية البنكية")}</h3><p role={error ? "alert" : "status"} className="text-xs">{error || dt("جاري تحميل السجل البنكي...")}</p><button type="button" className={button} onClick={() => void load().then(() => setError("")).catch(err => setError(errorText(err.message)))}>{dt("تحديث السجل")}</button></section>;
  const disabled = busy || !data.ready.ready || !data.confirmed || data.blocked || data.remainingMinor === 0;
  return <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3" aria-label={dt("إدارة العملية البنكية")}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold">{dt("إدارة العملية البنكية")}</h3><button type="button" disabled={busy || !data.ready.ready} className={button} onClick={() => void send({ action: "INQUIRE" })}>{dt("التحقق من العملية لدى البنك")}</button></div>
    <p className="text-xs text-slate-600"><bdi>{data.sale.provider === "ALBARAKA" ? "Albaraka Türk" : "Ziraat Katılım"} · {data.sale.currency}</bdi></p>
    <p className="break-all font-mono text-[11px] text-slate-500" dir="ltr">{data.sale.orderId}{data.sale.reference ? ` · ${data.sale.reference}` : ""}</p>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{[[dt("المبلغ الأصلي لدى البنك"), data.sale.amountMinor], [dt("المُعاد المسجل"), data.returnedMinor], [dt("المتبقي حسب السجل"), data.remainingMinor]].map(([title, value]) => <div key={String(title)} className="rounded-lg border bg-white p-2"><div className="text-[11px] text-slate-500">{title}</div><bdi className="text-sm font-bold">{money(Number(value))}</bdi></div>)}</div>
    <p className="text-[11px] text-slate-500">{dt("تُسجل الإلغاءات والاستردادات كتسويات منفصلة عن التبرع الأصلي. أي إجراء تم خارج هذه اللوحة يحتاج مطابقة مع البنك.")}</p>
    {!data.ready.ready && <p role="alert" className="text-xs text-amber-800">{errorText(data.ready.reason || "BANK_NOT_CONFIGURED")}</p>}
    {data.blocked && <p role="alert" className="text-xs font-semibold text-amber-800">{errorText("OPERATION_PENDING_REVIEW")}</p>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}{notice && <p role="status" className="text-xs font-semibold">{notice}</p>}
    {data.inquiry && <div className="space-y-1 text-xs"><p>{dt("آخر استعلام لدى البنك")}: {label(data.inquiry.inspection?.verified ? data.inquiry.state : "UNKNOWN")} · <bdi>{data.inquiry.code}</bdi> · <time>{new Date(data.inquiry.at).toLocaleString(dashIntl("ar-EG"), { timeZone: "Europe/Istanbul" })}</time></p>{data.inquiry.data && <details><summary className="cursor-pointer">{dt("تفاصيل الاستعلام")}</summary><pre dir="ltr" className="max-h-44 overflow-auto whitespace-pre-wrap break-all rounded border bg-white p-2 text-[11px]">{JSON.stringify(data.inquiry.data, null, 2)}</pre></details>}</div>}
    {data.canManage ? <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={disabled || data.returnedMinor > 0} onClick={() => { setAction("VOID"); setConfirmed(false); setReason(""); }}>{dt("إلغاء العملية")}</button><button type="button" className={button} disabled={disabled} onClick={() => { setAction("REFUND"); setAmount((data.remainingMinor / 100).toFixed(2)); setConfirmed(false); setReason(""); }}>{dt("استرداد كامل أو جزئي")}</button><button type="button" disabled={busy} className={button} onClick={() => void load().catch(err => setError(errorText(err.message)))}>{dt("تحديث السجل")}</button></div> : <p className="text-xs text-slate-500">{dt("الإلغاء والاسترداد متاحان للمدير فقط.")}</p>}
    {action && <div className="space-y-3 rounded-lg border border-amber-300 bg-white p-3">
      <p className="text-sm font-bold">{action === "VOID" ? dt("تأكيد إلغاء العملية قبل إقفال اليوم البنكي") : dt("تأكيد الاسترداد إلى البطاقة الأصلية")}</p>
      <p className="text-xs">{action === "VOID" ? dt("البنك يحدد قابلية الإلغاء حسب إقفال الدفعة البنكية. رفض الإلغاء لا ينفذ استردادًا تلقائيًا.") : dt("يمكن تكرار الاسترداد الجزئي ضمن المبلغ المتبقي فقط. يحدد البنك قبول الاسترداد وتوقيته.")}</p>
      <p className="text-sm font-semibold"><bdi>{action === "VOID" ? money(data.sale.amountMinor) : data.sale.currency}</bdi></p>
      {action === "REFUND" && <label className="block space-y-1 text-xs">{dt("مبلغ الاسترداد")}<input type="number" min="0.01" max={data.remainingMinor / 100} step="0.01" inputMode="decimal" value={amount} disabled={busy} onChange={event => setAmount(event.target.value)} className={input} dir="ltr" /></label>}
      <label className="block space-y-1 text-xs">{dt("سبب الإجراء")}<textarea maxLength={500} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} className={input} /></label>
      <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />{dt("راجعت العملية والمبلغ والعملة وأوافق على تنفيذ الإجراء البنكي.")}</label>
      <div className="flex gap-2"><button type="button" className={button} disabled={busy || !confirmed || reason.trim().length < 5 || (action === "REFUND" && (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || Number(amount) > data.remainingMinor / 100))} onClick={execute}>{busy ? dt("قيد المعالجة") : dt("تنفيذ الإجراء البنكي")}</button><button type="button" className={button} disabled={busy} onClick={() => setAction(null)}>{dt("رجوع")}</button></div>
    </div>}
    <div className="space-y-2"><h4 className="text-xs font-bold">{dt("سجل الإلغاء والاسترداد")}</h4>{data.operations.length ? data.operations.slice(-historyLimit).reverse().map(op => <article key={op.id} className="space-y-1 rounded-lg border bg-white p-2 text-xs"><div className="flex flex-wrap justify-between gap-2"><b>{op.action === "VOID" ? dt("إلغاء العملية") : dt("استرداد")}</b><bdi>{money(op.amountMinor)}</bdi></div><p>{label(op.state)} · <bdi>{op.code || "—"}</bdi></p><p>{op.actorName} · {new Date(op.createdAt).toLocaleString(dashIntl("ar-EG"), { timeZone: "Europe/Istanbul" })}</p><p className="break-words">{op.reason}</p><p className="break-all" dir="ltr">{op.reference || op.id}</p>{op.resolution && <p className="break-words">{dt("إثبات المطابقة")}: {op.resolution.evidence}</p>}{data.canManage && ["UNKNOWN", "PENDING"].includes(op.state) && <button type="button" className={button} disabled={busy || Date.now() - Date.parse(op.createdAt) < 120000} onClick={() => { setResolution(op); setSucceeded(null); setEvidence(""); setConfirmed(false); }}>{dt("مطابقة نتيجة غير مؤكدة")}</button>}</article>) : <p className="text-xs text-slate-500">{dt("لا توجد إلغاءات أو استردادات مسجلة.")}</p>}</div>
    {data.operations.length > historyLimit && <button type="button" className={button} onClick={() => setHistoryLimit(limit => limit + 20)}>{dt("عرض المزيد")} <bdi>({historyLimit}/{data.operations.length})</bdi></button>}
    {resolution && <div className="space-y-3 rounded-lg border border-amber-300 bg-white p-3"><p className="text-sm font-bold">{dt("مطابقة نتيجة غير مؤكدة")}</p><p className="text-xs">{dt("نفّذ الاستعلام أولًا، ثم أدخل مرجع البنك ودليل النتيجة. هذا الإجراء يسجل النتيجة فقط ولا يرسل استردادًا جديدًا.")}</p><select className={input} aria-label={dt("نتيجة المطابقة لدى البنك")} value={succeeded === null ? "" : String(succeeded)} onChange={event => setSucceeded(event.target.value === "" ? null : event.target.value === "true")}><option value="">{dt("اختر النتيجة")}</option><option value="true">{dt("أكد البنك نجاح الإجراء")}</option><option value="false">{dt("أكد البنك عدم تنفيذ الإجراء")}</option></select><label className="block space-y-1 text-xs">{dt("إثبات المطابقة")}<textarea maxLength={1000} value={evidence} onChange={event => setEvidence(event.target.value)} className={input} /></label><label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{dt("أؤكد أن النتيجة ومرجعها مطابقان لسجل البنك.")}</label><button type="button" className={button} disabled={busy || !confirmed || succeeded === null || evidence.trim().length < 12} onClick={() => void send({ action: "RECONCILE", operationId: resolution.id, succeeded, evidence, confirmed })}>{dt("حفظ المطابقة")}</button><button type="button" className={button} disabled={busy} onClick={() => setResolution(null)}>{dt("رجوع")}</button></div>}
  </section>;
}
