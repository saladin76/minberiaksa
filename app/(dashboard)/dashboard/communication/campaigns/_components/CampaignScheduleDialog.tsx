"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dt } from "@/lib/dashboard/i18n";
import { CAMPAIGN_SCHEDULE_ZONE, campaignLocalTime, campaignScheduleInstant } from "@/lib/communication/campaign-schedule";
import type { CampaignRow } from "./campaign-ui";
export function CampaignScheduleDialog({ campaign, onClose, onChanged }: { campaign: CampaignRow; onClose: () => void; onChanged: () => void }) {
 const [time, setTime] = useState(() => campaignLocalTime(campaign.scheduledAt ? new Date(campaign.scheduledAt) : new Date(Date.now() + 3600_000)));
 const [busy, setBusy] = useState(false), [error, setError] = useState("");
 async function save(action: "SCHEDULE" | "UNSCHEDULE") {
  if (busy) return;
  const instant = campaignScheduleInstant(time);
  if (action === "SCHEDULE" && !instant) { setError(dt("اختر موعدًا صحيحًا في المستقبل.")); return; }
  setBusy(true); setError("");
  try {
   const response = await fetch(`/api/communication/campaigns/${campaign.id}/transition`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(action === "SCHEDULE" ? { scheduledAt: instant!.toISOString() } : {}) }) });
   const result = await response.json().catch(() => null);
   if (!response.ok || !result?.ok) throw new Error(result?.error || dt("تعذّر حفظ الجدولة"));
   toast.success(action === "SCHEDULE" ? dt("تمت جدولة الحملة") : dt("تم إلغاء الجدولة")); onChanged(); onClose();
  } catch (cause) { setError(cause instanceof Error ? cause.message : dt("تعذّر حفظ الجدولة")); }
  finally { setBusy(false); }
 }
 return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{dt("جدولة الحملة")}</DialogTitle><DialogDescription>{campaign.name}</DialogDescription></DialogHeader><label className="space-y-2 text-sm"><span className="block">{dt("موعد الإرسال بتوقيت إسطنبول")}</span><input aria-label={dt("موعد الإرسال بتوقيت إسطنبول")} type="datetime-local" dir="ltr" value={time} min={campaignLocalTime(new Date())} onChange={event => setTime(event.target.value)} disabled={busy} className="min-h-11 w-full rounded-lg border px-3" /></label><p className="text-xs text-slate-500">{CAMPAIGN_SCHEDULE_ZONE} · {dt("تبدأ المهمة المجدولة الإرسال عند حلول الموعد وتتابع الدفعات تلقائيًا.")}</p>{error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}<div className="flex flex-wrap justify-end gap-2">{campaign.status === "SCHEDULED" ? <button disabled={busy} type="button" onClick={() => void save("UNSCHEDULE")} className="min-h-11 rounded-lg border px-4 text-sm">{dt("إلغاء الجدولة")}</button> : null}<button disabled={busy} type="button" onClick={() => void save("SCHEDULE")} className="min-h-11 rounded-lg bg-brand px-4 text-sm text-white disabled:opacity-50">{busy ? dt("جارٍ الحفظ...") : dt("حفظ الجدولة")}</button></div></DialogContent></Dialog>;
}
