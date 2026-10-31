"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { dashDir, dt } from "@/lib/dashboard/i18n";

type Diagnostic = {
  status: string; lastBlocked: string | null; blocked: string | null; canResume: boolean;
  coverage: { ok: boolean; undecided: string[]; missingWithRecipients: Array<{ locale: string; label: string; recipientCount: number }> };
  controls: { dailyCap: number; paused: boolean };
  progress: { batches: number; scanned: number; done: boolean };
};
export function campaignBlockLabel(code: string | null): string {
  if (code === "LANGUAGE_COVERAGE_INCOMPLETE") return dt("القالب لا يغطي جميع لغات الجمهور");
  if (code === "DAILY_CAP_REACHED") return dt("تم بلوغ الحد اليومي المحدد في إعدادات الحملة");
  if (code === "PAUSED") return dt("الحملة متوقفة مؤقتًا من تحكمات الإرسال.");
  if (code === "QUIET_HOURS") return dt("الحملة داخل ساعات عدم الإرسال وستستأنف تلقائيًا بعدها.");
  if (code === "SCHEDULED_STOP") return dt("الحملة وصلت إلى وقت التوقف المجدول.");
  if (code === "EMERGENCY_STOP") return dt("إرسال الحملات متوقف حاليًا بسبب إيقاف الطوارئ العام.");
  if (code === "ALREADY_RUNNING") return dt("الحملة قيد الإرسال الآن  انتظر انتهاء الدفعة الجارية.");
  if (code === "NOT_RESUMABLE") return dt("لا توجد دفعة متوقفة لمتابعتها.");
  if (code === "CAMPAIGN_STATE_CHANGED") return dt("تغيرت الحملة؛ حدّثها قبل تأكيد الإجراء.");
  return code ? dt("تعذّر الإرسال: {0}", [code]) : dt("جاهزة للاستكمال");
}
export function CampaignRecoveryDialog({ open, onOpenChange, campaignId, campaignName, onChanged, onControls, canControl }: { open: boolean; onOpenChange: (value: boolean) => void; campaignId: string; campaignName: string; onChanged: () => void; onControls: () => void; canControl: boolean }) {
  const [data, setData] = React.useState<Diagnostic | null>(null), [error, setError] = React.useState<string | null>(null), [busy, setBusy] = React.useState(false), [loading, setLoading] = React.useState(false), [revision, setRevision] = React.useState(0);
  React.useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); setLoading(true); setError(null); setData(null);
    fetch(`/api/communication/campaigns/${campaignId}/recovery`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const json = await response.json(); if (!response.ok || !json.ok) throw new Error("DIAGNOSTIC_UNAVAILABLE");
      if (!controller.signal.aborted) setData(json.data);
    }).catch(() => { if (!controller.signal.aborted) setError(dt("تعذّر تحميل التشخيص. أعد المحاولة؛ لم تُرسل رسائل.")); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, campaignId, revision]);
  const resume = async () => {
    if (busy || !data?.canResume) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/communication/campaigns/${campaignId}/recovery`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: true }) });
      const json = await response.json();
      if (!response.ok || !json.ok) { if (json.diagnostic) setData(json.diagnostic); throw new Error(json.error || "RECOVERY_UNAVAILABLE"); }
      toast.success(dt("جُدول استكمال الحملة من موضعها المحفوظ")); onChanged(); onOpenChange(false);
    } catch (e) { setError(campaignBlockLabel((e as Error).message)); }
    finally { setBusy(false); }
  };
  const missing = data?.coverage.missingWithRecipients.filter(row => data.coverage.undecided.includes(row.locale)) ?? [];
  return <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}><DialogContent dir={dashDir()} onClick={event => event.stopPropagation()} className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
    <DialogHeader><DialogTitle>{dt("تشخيص واستكمال الحملة")}</DialogTitle><DialogDescription>{campaignName}</DialogDescription></DialogHeader>
    {loading ? <p role="status">{dt("جارٍ فحص لغات الجمهور وإعدادات الإرسال…")}</p> : null}
    {error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
    {data ? <div className="space-y-4 text-sm">
      <p role="status" className={`rounded-lg p-3 ${data.blocked ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}>{campaignBlockLabel(data.blocked)}</p>
      {missing.length ? <><p>{dt("هذه اللغات تحتاج نسخة كاملة ومعتمدة من القالب قبل استكمال الإرسال:")}</p><ul className="grid gap-2 sm:grid-cols-2">{missing.map(row => <li key={row.locale} className="flex justify-between gap-4 rounded-lg border p-3"><span>{row.label}</span><span>{row.recipientCount.toLocaleString("en-US")}</span></li>)}</ul><Link href="/dashboard/templates" className="inline-block font-semibold text-brand underline">{dt("إكمال لغات القالب")}</Link></> : null}
      <p>{dt("الدُفعات المحفوظة: {0} · جهات الاتصال التي فُحصت: {1}", [data.progress.batches, data.progress.scanned])}</p>
      <p>{dt("الحد اليومي الداخلي: {0}", [data.controls.dailyCap > 0 ? data.controls.dailyCap.toLocaleString("en-US") : dt("بلا حد داخلي")])}</p>
      <p className="text-xs leading-6 text-slate-500">{dt("الاستكمال يتابع الجمهور من موضع التوقف دون تكرار الرسائل المقبولة. إعادة محاولة الرسائل الفاشلة إجراء منفصل، ورفض Meta لبعض الرسائل لا يعني توقف الحملة كلها.")}</p>
    </div> : null}
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || loading} onClick={() => setRevision(value => value + 1)}>{dt("إعادة الفحص")}</Button>{canControl ? <Button variant="outline" disabled={busy} onClick={onControls}>{dt("إعدادات الإرسال")}</Button> : null}<Button disabled={busy || loading || !data?.canResume} onClick={resume}>{busy ? dt("جارٍ الحفظ…") : dt("تأكيد جدولة الاستكمال")}</Button></div>
  </DialogContent></Dialog>;
}
