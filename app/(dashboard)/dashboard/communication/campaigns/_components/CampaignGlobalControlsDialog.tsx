"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "react-hot-toast";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { readDashboardJson } from "@/lib/dashboard/read-json";
import { dt } from "@/lib/dashboard/i18n";

type Controls = { emergencyStop: boolean; whatsappMarketingCooldownDays: number };

/** Global controls must remain accessible with no active WhatsApp campaign. */
export function CampaignGlobalControlsDialog() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false), [attempt, setAttempt] = useState(0);
  const [controls, setControls] = useState<Controls | null>(null);
  const [days, setDays] = useState(""), [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false), [saving, setSaving] = useState(false);
  const admin = session?.user?.role === "ADMIN";

  useEffect(() => {
    if (!open || !admin) return;
    const controller = new AbortController();
    setLoading(true); setError(null); setControls(null);
    void readDashboardJson<Controls>("/api/communication/campaigns/global-controls", controller.signal).then(data => {
      if (!controller.signal.aborted) { setControls(data); setDays(String(data.whatsappMarketingCooldownDays)); }
    }).catch(() => {
      if (!controller.signal.aborted) setError(dt("تعذّر تحميل إعدادات الإرسال العامة."));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, admin, attempt]);

  const valid = /^\d+$/.test(days) && Number(days) <= 365;
  async function save() {
    if (!controls || !valid || saving) return;
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/communication/campaigns/global-controls", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappMarketingCooldownDays: Number(days) }),
      });
      const data = await response.json();
      if (!response.ok || data?.ok !== true) throw new Error(dt("تعذّر حفظ إعدادات الإرسال العامة."));
      setControls(data); setDays(String(data.whatsappMarketingCooldownDays));
      toast.success(dt("تم حفظ إعدادات الإرسال العامة"));
    } catch { setError(dt("تعذّر حفظ إعدادات الإرسال العامة.")); }
    finally { setSaving(false); }
  }

  if (!admin) return null;
  return <>
    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}><Settings2 className="h-3.5 w-3.5" />{dt("إعدادات الإرسال العامة")}</Button>
    <Dialog open={open} onOpenChange={value => { if (!saving) setOpen(value); }}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{dt("إعدادات الإرسال العامة")}</DialogTitle><DialogDescription>{dt("الفاصل بين الرسائل التسويقية عبر واتساب")}</DialogDescription></DialogHeader>
        {loading ? <p role="status">{dt("جارٍ التحميل…")}</p> : null}
        {error ? <div role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p>{error}</p>{!controls ? <Button variant="outline" size="sm" className="mt-2" onClick={() => setAttempt(value => value + 1)}>{dt("إعادة المحاولة")}</Button> : null}</div> : null}
        {controls ? <form onSubmit={event => { event.preventDefault(); void save(); }} className="space-y-4">
          <p className="text-sm text-slate-600">{dt("اجعلها 0 للسماح بالإرسال دون فاصل، أو حدّد عدد الأيام الذي تريده.")}</p>
          <label className="flex items-center gap-3 text-sm">{dt("عدد الأيام")}<input type="number" min={0} max={365} step={1} value={days} disabled={saving} onChange={event => setDays(event.target.value)} className="h-10 w-24 rounded-lg border px-3" dir="ltr" /></label>
          <p className="text-xs text-slate-500">{dt("هذه المدة عامة لكل الحملات؛ الساعات والحد اليومي واستثناءات الجمهور تُضبط داخل كل حملة.")}</p>
          {controls.emergencyStop ? <p role="status" className="text-sm text-amber-800">{dt("إيقاف الطوارئ العام مفعّل")}</p> : null}
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={!valid || saving || Number(days) === controls.whatsappMarketingCooldownDays}>{saving ? dt("جار الحفظ…") : dt("حفظ المدة")}</Button><Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>{dt("إغلاق")}</Button></div>
        </form> : null}
      </DialogContent>
    </Dialog>
  </>;
}
