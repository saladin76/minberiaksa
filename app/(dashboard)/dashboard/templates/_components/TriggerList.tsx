"use client";

import * as React from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, Mail, MessageCircle, MessageSquare, Clock, Play, Eye, AlertTriangle, RefreshCw } from "lucide-react";
import { TriggerEditorDialog } from "./TriggerEditorDialog";
import { EVENT_CATALOG, DEFAULT_COOLDOWN_DAYS, DEFAULT_LAPSE_DAYS } from "@/lib/events/catalog";
import { dt, dtx } from "@/lib/dashboard/i18n";

interface TriggerRow {
  id: string;
  event: string;
  channel: "EMAIL" | "WHATSAPP" | "SMS";
  templateId: string;
  templateName: string | null;
  enabled: boolean;
  lapseDays: number | null;
  cooldownDays: number | null;
  createdAt: string;
  updatedAt: string;
}

interface LapsedRunSummary {
  sent: number;
  skipped: number;
  failed: number;
  donorsScanned: number;
  truncated: boolean;
  dryRun: boolean;
}

const eventLabel = (e: string) =>
  EVENT_CATALOG.find((x) => x.event === e)?.label ?? e;

const isScheduledEvent = (e: string) =>
  EVENT_CATALOG.find((x) => x.event === e)?.scheduled === true;

export function TriggerList() {
  const [triggers, setTriggers] = React.useState<TriggerRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [running, setRunning] = React.useState<"" | "preview" | "send">("");
  const [lastRun, setLastRun] = React.useState<LapsedRunSummary | null>(null);

  const fetchAll = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await axios.get("/api/templates/triggers", { timeout: 15000 });
      setTriggers(res.data?.triggers ?? []);
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const message = status
        ? dt("تعذّر تحميل الأحداث التلقائية (HTTP {0})", [status])
        : dt("تعذّر تحميل الأحداث التلقائية. حاول مرة أخرى.");
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const toggleEnabled = async (id: string, enabled: boolean) => {
    try {
      await axios.patch(`/api/templates/triggers/${id}`, { enabled });
      setTriggers((prev) => prev.map((t) => (t.id === id ? { ...t, enabled } : t)));
    } catch {
      toast.error(dt("فشل التحديث"));
    }
  };

  const saveTiming = async (id: string, patch: { lapseDays?: number; cooldownDays?: number }) => {
    const field = "lapseDays" in patch ? "lapseDays" : "cooldownDays";
    const value = patch[field];
    if (!Number.isInteger(value) || (value as number) < 1) {
      toast.error(dt("أدخل عددًا صحيحًا لا يقل عن ١"));
      fetchAll();
      return;
    }
    try {
      await axios.patch(`/api/templates/triggers/${id}`, patch);
      setTriggers((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      toast.success(dt("تم تحديث التوقيت"));
    } catch {
      toast.error(dt("فشل التحديث"));
      fetchAll();
    }
  };

  const runLapsed = async (dryRun: boolean) => {
    setRunning(dryRun ? "preview" : "send");
    setLastRun(null);
    try {
      const res = await axios.post("/api/templates/triggers/run-lapsed", { dryRun });
      const summary = res.data as LapsedRunSummary;
      setLastRun(summary);
      toast.success(
        dryRun
          ? dt("المعاينة: {0} متبرّع سيصله التذكير", [summary.sent])
          : dt("تم الإرسال: {0} رسالة{1}", [summary.sent, summary.failed ? dt("، {0} فشل", [summary.failed]) : ""])
      );
    } catch {
      toast.error(dt("فشل التشغيل"));
    } finally {
      setRunning("");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(dt("حذف هذا الحدث التلقائي؟"))) return;
    try {
      await axios.delete(`/api/templates/triggers/${id}`);
      toast.success(dt("تم الحذف"));
      fetchAll();
    } catch {
      toast.error(dt("فشل الحذف"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-muted-foreground">
          {loading ? "…" : dt("{0} حدث تلقائي", [triggers.length])}
        </p>
        <Button
          size="sm"
          onClick={() => setEditorOpen(true)}
          className="gap-2 bg-brand hover:bg-brand/90"
        >
          <Plus className="w-4 h-4" /> {dt(" حدث جديد")}</Button>
      </div>

      <div className="rounded-lg border border-border bg-blue-50/50 p-3 text-xs text-slate-700 leading-relaxed">
        <p className="font-semibold mb-1">{dt("كيف يعمل النظام؟")}</p>
        <p>
          {dt("عند وقوع الحدث (مثلاً نجاح تبرّع)، يقوم النظام تلقائيًا بإرسال القالب المحدّد للمتبرع المعني  بدون أي تدخّل يدوي. استخدم متغيّرات مثل ")}<span className="font-mono">{"{{donation.amountUSD}}"}</span> {dt(" داخل القالب لتخصيص الرسالة.")}</p>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm text-start">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              <th className="text-start py-3 px-4 font-semibold text-slate-700">{dt("الحدث")}</th>
              <th className="text-start py-3 px-4 font-semibold text-slate-700">{dt("القناة")}</th>
              <th className="text-start py-3 px-4 font-semibold text-slate-700">{dt("القالب")}</th>
              <th className="text-start py-3 px-4 font-semibold text-slate-700">{dt("التوقيت")}</th>
              <th className="text-start py-3 px-4 font-semibold text-slate-700">{dt("مفعّل")}</th>
              <th className="text-start py-3 px-4 font-semibold text-slate-700">{dt("الإجراءات")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                </td>
              </tr>
            ) : loadError ? (
              <tr>
                <td colSpan={6} className="py-10 text-center">
                  <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                    <AlertTriangle className="h-5 w-5" />
                    <p className="text-xs font-medium">{loadError}</p>
                    <Button size="sm" variant="outline" onClick={() => void fetchAll()} className="gap-1.5 bg-white">
                      <RefreshCw className="h-3.5 w-3.5" />
                      {dt("إعادة المحاولة")}</Button>
                  </div>
                </td>
              </tr>
            ) : triggers.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-500">
                  {dt("لا توجد أحداث تلقائية بعد  اضغط «حدث جديد» للبدء")}</td>
              </tr>
            ) : (
              triggers.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                  <td className="py-3 px-4 font-medium text-slate-900">{eventLabel(t.event)}</td>
                  <td className="py-3 px-4 text-slate-700">
                    <span className="inline-flex items-center gap-1.5">
                      {t.channel === "EMAIL" ? (
                        <>
                          <Mail className="w-3.5 h-3.5 text-brand" /> {dt(" بريد")}</>
                      ) : t.channel === "WHATSAPP" ? (
                        <>
                          <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" /> {dt(" واتساب")}</>
                      ) : (
                        <>
                          <MessageSquare className="w-3.5 h-3.5 text-orange-500" /> SMS
                        </>
                      )}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-700">
                    {t.templateName ?? <span className="text-red-500 text-xs">{dt("القالب محذوف")}</span>}
                  </td>
                  <td className="py-3 px-4">
                    {isScheduledEvent(t.event) ? (
                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                        <span>{dt("بعد")}</span>
                        <Input
                          type="number"
                          min={1}
                          max={3650}
                          defaultValue={t.lapseDays ?? DEFAULT_LAPSE_DAYS}
                          onBlur={(e) => {
                            const next = Number(e.target.value);
                            if (next !== (t.lapseDays ?? DEFAULT_LAPSE_DAYS)) saveTiming(t.id, { lapseDays: next });
                          }}
                          className="h-7 w-16 px-2 text-center text-xs"
                          aria-label={dt("عدد الأيام منذ آخر تبرّع")}
                        />
                        <span>{dt("يوم · كل")}</span>
                        <Input
                          type="number"
                          min={1}
                          max={3650}
                          defaultValue={t.cooldownDays ?? DEFAULT_COOLDOWN_DAYS}
                          onBlur={(e) => {
                            const next = Number(e.target.value);
                            if (next !== (t.cooldownDays ?? DEFAULT_COOLDOWN_DAYS)) saveTiming(t.id, { cooldownDays: next });
                          }}
                          className="h-7 w-16 px-2 text-center text-xs"
                          aria-label={dt("أقل مدة بين تذكيرين")}
                        />
                        <span>{dt("يوم")}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">{dt("فوري")}</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <Checkbox
                      checked={t.enabled}
                      onCheckedChange={(checked) =>
                        toggleEnabled(t.id, checked === true)
                      }
                      aria-label={t.enabled ? dt("تعطيل الحدث") : dt("تفعيل الحدث")}
                    />
                  </td>
                  <td className="py-3 px-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(t.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-3.5 h-3.5 me-1" /> {dt(" حذف")}</Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {triggers.some((t) => isScheduledEvent(t.event)) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
            <Clock className="w-3.5 h-3.5" /> {dt(" تذكير التبرّع مجددًا")}</p>
          <p className="text-[11px] text-amber-900 leading-relaxed">
            {dt("يُفحص تلقائيًا كل يوم الساعة ٩ صباحًا (UTC). يُستثنى المشتركون شهريًا ومن ألغى الاشتراك في الرسائل، ولا يُرسل التذكير لنفس المتبرّع مرتين قبل انتهاء فترة الانتظار. لإيقافه: أزل علامة «مفعّل» من الجدول أعلاه.")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={running !== ""}
              onClick={() => runLapsed(true)}
              className="gap-1.5"
            >
              {running === "preview" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
              {dt("معاينة (بدون إرسال)")}</Button>
            <Button
              size="sm"
              disabled={running !== ""}
              onClick={() => {
                if (!window.confirm(dt("إرسال التذكير فعليًا الآن للمتبرعين المستحقين؟"))) return;
                runLapsed(false);
              }}
              className="gap-1.5 bg-brand hover:bg-brand/90"
            >
              {running === "send" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {dt("تشغيل الآن")}</Button>
          </div>
          {lastRun && (
            <p className="text-[11px] text-slate-700">
              {lastRun.dryRun ? dt("المعاينة") : dt("آخر تشغيل")}{dtx(": فُحص {0} متبرّع  ", [lastRun.donorsScanned])}
              {lastRun.dryRun ? dt("سيُرسل") : dt("أُرسل")} {dtx(" {0}، تخطّي {1}، فشل {2}", [lastRun.sent, lastRun.skipped, lastRun.failed])}
              {lastRun.truncated ? dt(" (بقيت دفعة للتشغيل التالي)") : ""}
            </p>
          )}
        </div>
      )}

      <TriggerEditorDialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) fetchAll();
        }}
      />
    </div>
  );
}
