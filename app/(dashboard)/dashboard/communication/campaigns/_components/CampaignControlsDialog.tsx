"use client";

import * as React from "react";
import { toast } from "react-hot-toast";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Pause, Play, Gauge, Moon, ShieldCheck, CalendarClock, Zap, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type SpeedMode = "SAFE" | "BALANCED" | "FAST" | "MAX";
type CampaignPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
type Controls = {
  paused: boolean;
  speedMode: SpeedMode;
  autoSpeed: boolean;
  priority: CampaignPriority;
  dailyCap: number;
  scheduledStopAt: string | null;
  resumeAt: string | null;
  quietHours: { enabled: boolean; start: string; end: string; timezone: string };
};

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const SPEEDS: Array<{ id: SpeedMode; label: string; hint: string }> = [
  { id: "SAFE", label: "هادئ", hint: "أقل ضغط على المزود" },
  { id: "BALANCED", label: "متوازن", hint: "الوضع الافتراضي" },
  { id: "FAST", label: "سريع", hint: "لحملات أكبر" },
  { id: "MAX", label: "أقصى سرعة آمنة", hint: "أعلى توازي مضبوط" },
];

export function CampaignControlsDialog({
  open,
  onOpenChange,
  campaignId,
  campaignName,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
  onChanged: () => void;
}) {
  const [controls, setControls] = React.useState<Controls | null>(null);
  const [usage, setUsage] = React.useState<{ usedLast24h: number; remaining: number | null } | null>(null);
  const [globalState, setGlobalState] = React.useState<{ emergencyStop: boolean; canManage: boolean }>({ emergencyStop: false, canManage: false });
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/communication/campaigns/${campaignId}/controls`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error ?? "load failed");
        setControls(data.controls);
        setUsage(data.usage ?? null);
        setGlobalState(data.global ?? { emergencyStop: false, canManage: false });
      })
      .catch(() => toast.error("تعذّر تحميل إعدادات الإرسال"))
      .finally(() => setLoading(false));
  }, [open, campaignId]);

  const toggleEmergencyStop = async () => {
    if (!globalState.canManage) return;
    const next = !globalState.emergencyStop;
    const prompt = next
      ? "سيتم إيقاف جميع حملات التواصل فورًا قبل أي دفعة جديدة. هل تريد المتابعة؟"
      : "سيتم السماح للحملات المجدولة والجارية بالاستئناف وفق تحكماتها. هل تريد المتابعة؟";
    if (!window.confirm(prompt)) return;
    try {
      const res = await fetch("/api/communication/campaigns/global-controls", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emergencyStop: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? "تعذّر تحديث إيقاف الطوارئ");
      setGlobalState((current) => ({ ...current, emergencyStop: Boolean(data.emergencyStop) }));
      toast.success(next ? "تم إيقاف جميع الحملات" : "تم إلغاء إيقاف الطوارئ");
      onChanged();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const save = async () => {
    if (!controls) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/communication/campaigns/${campaignId}/controls`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(controls),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "تعذّر الحفظ");
      setControls(data.controls);
      toast.success("تم حفظ تحكمات الإرسال");
      onChanged();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="fixed left-1/2 top-1/2 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border bg-white p-0 shadow-2xl"
        dir="rtl"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
            <Gauge className="h-5 w-5 text-brand" />
            تحكم إرسال الحملة
          </DialogTitle>
          <p className="mt-1 text-xs text-slate-500">{campaignName}</p>
        </div>

        {loading || !controls ? (
          <div className="flex min-h-64 items-center justify-center text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-5 p-5">
            <section className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">تشغيل الحملة</h3>
                  <p className="mt-1 text-xs text-slate-500">الإيقاف مؤقت فقط. عند التشغيل تكمل الحملة من نفس المكان بدون إعادة إرسال السابق.</p>
                </div>
                <Button
                  type="button"
                  variant={controls.paused ? "default" : "outline"}
                  onClick={() => setControls({ ...controls, paused: !controls.paused })}
                  className={cn(controls.paused && "bg-emerald-600 hover:bg-emerald-700")}
                >
                  {controls.paused ? <Play className="me-1.5 h-4 w-4" /> : <Pause className="me-1.5 h-4 w-4" />}
                  {controls.paused ? "استئناف" : "إيقاف مؤقت"}
                </Button>
              </div>
            </section>

            <section className={cn(
              "rounded-xl border p-4",
              globalState.emergencyStop ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50",
            )}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className={cn("mt-0.5 h-4 w-4", globalState.emergencyStop ? "text-rose-600" : "text-slate-500")} />
                  <div>
                    <h3 className={cn("text-sm font-semibold", globalState.emergencyStop ? "text-rose-800" : "text-slate-800")}>
                      إيقاف الطوارئ العام
                    </h3>
                    <p className={cn("mt-1 text-xs", globalState.emergencyStop ? "text-rose-700" : "text-slate-500")}>
                      {globalState.emergencyStop
                        ? "جميع الحملات متوقفة قبل أي دفعة جديدة."
                        : "الحملات تعمل وفق الجدولة والحدود والتحكمات الحالية."}
                    </p>
                  </div>
                </div>
                {globalState.canManage ? (
                  <Button
                    type="button"
                    variant={globalState.emergencyStop ? "outline" : "destructive"}
                    onClick={() => void toggleEmergencyStop()}
                    className={cn(globalState.emergencyStop && "border-emerald-200 text-emerald-700 hover:bg-emerald-50")}
                  >
                    {globalState.emergencyStop ? <Play className="me-1.5 h-4 w-4" /> : <Pause className="me-1.5 h-4 w-4" />}
                    {globalState.emergencyStop ? "إلغاء إيقاف الطوارئ" : "إيقاف جميع الحملات"}
                  </Button>
                ) : (
                  <span className="text-[11px] text-slate-400">متاح للمدير فقط</span>
                )}
              </div>
            </section>

            <section className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">سرعة الإرسال</h3>
                  <p className="mt-1 text-xs text-slate-500">اختر سرعة ثابتة أو دع النظام يرفع/يخفض السرعة حسب المتبقّي والحد اليومي وموعد التوقف.</p>
                </div>
                <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={controls.autoSpeed}
                    onChange={(e) => setControls({ ...controls, autoSpeed: e.target.checked })}
                  />
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  Auto Speed
                </label>
              </div>
              <div className={cn("grid grid-cols-2 gap-2 md:grid-cols-4", controls.autoSpeed && "opacity-50")}>
                {SPEEDS.map((speed) => (
                  <button
                    key={speed.id}
                    type="button"
                    disabled={controls.autoSpeed}
                    onClick={() => setControls({ ...controls, speedMode: speed.id })}
                    className={cn(
                      "rounded-xl border p-3 text-right disabled:cursor-not-allowed",
                      controls.speedMode === speed.id ? "border-brand bg-brand/5 ring-1 ring-brand/20" : "border-slate-200 hover:bg-slate-50",
                    )}
                  >
                    <span className="block text-xs font-semibold text-slate-900">{speed.label}</span>
                    <span className="mt-1 block text-[10px] text-slate-500">{speed.hint}</span>
                  </button>
                ))}
              </div>
              {controls.autoSpeed && (
                <p className="text-[11px] text-amber-700">النظام سيختار SAFE / BALANCED / FAST / MAX تلقائيًا مع استمرار حدود الأمان.</p>
              )}
            </section>

            <section className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">أولوية الحملة</h3>
                <p className="mt-1 text-xs text-slate-500">عند وجود أكثر من حملة مستحقة، يبدأ الـScheduler بالأعلى أولوية أولًا.</p>
              </div>
              <select
                value={controls.priority}
                onChange={(e) => setControls({ ...controls, priority: e.target.value as CampaignPriority })}
                className="h-10 w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="LOW">منخفضة</option>
                <option value="NORMAL">عادية</option>
                <option value="HIGH">عالية</option>
                <option value="URGENT">عاجلة</option>
              </select>
            </section>

            <section className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-900">توقف واستئناف مجدول</h3>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-slate-600">
                  <span>إيقاف الإرسال عند</span>
                  <input
                    type="datetime-local"
                    value={toLocalInput(controls.scheduledStopAt)}
                    onChange={(e) => setControls({ ...controls, scheduledStopAt: fromLocalInput(e.target.value) })}
                    className="h-10 w-full rounded-lg border border-slate-200 px-3"
                    dir="ltr"
                  />
                </label>
                <label className="space-y-1 text-xs text-slate-600">
                  <span>استئناف تلقائي عند (اختياري)</span>
                  <input
                    type="datetime-local"
                    value={toLocalInput(controls.resumeAt)}
                    onChange={(e) => setControls({ ...controls, resumeAt: fromLocalInput(e.target.value) })}
                    className="h-10 w-full rounded-lg border border-slate-200 px-3"
                    dir="ltr"
                  />
                </label>
              </div>
              <p className="text-[11px] text-slate-500">إذا تركت الاستئناف فارغًا، ستتوقف الحملة عند الموعد وتظل متوقفة حتى تعدّل التحكمات أو الموعد.</p>
            </section>

            <section className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <Moon className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-900">ساعات عدم الإرسال</h3>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={controls.quietHours.enabled}
                  onChange={(e) => setControls({ ...controls, quietHours: { ...controls.quietHours, enabled: e.target.checked } })}
                />
                تفعيل Quiet Hours
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="space-y-1 text-xs text-slate-600">
                  <span>من</span>
                  <input
                    type="time"
                    value={controls.quietHours.start}
                    onChange={(e) => setControls({ ...controls, quietHours: { ...controls.quietHours, start: e.target.value } })}
                    className="h-10 w-full rounded-lg border border-slate-200 px-3"
                  />
                </label>
                <label className="space-y-1 text-xs text-slate-600">
                  <span>إلى</span>
                  <input
                    type="time"
                    value={controls.quietHours.end}
                    onChange={(e) => setControls({ ...controls, quietHours: { ...controls.quietHours, end: e.target.value } })}
                    className="h-10 w-full rounded-lg border border-slate-200 px-3"
                  />
                </label>
                <label className="space-y-1 text-xs text-slate-600">
                  <span>المنطقة الزمنية</span>
                  <input
                    value={controls.quietHours.timezone}
                    onChange={(e) => setControls({ ...controls, quietHours: { ...controls.quietHours, timezone: e.target.value } })}
                    className="h-10 w-full rounded-lg border border-slate-200 px-3"
                    dir="ltr"
                    placeholder="Europe/Istanbul"
                  />
                </label>
              </div>
              <p className="text-[11px] text-slate-500">مثال: 00:00 → 08:00 يمنع الإرسال ليلًا، ثم يستأنف الـScheduler تلقائيًا بعد 08:00.</p>
            </section>

            <section className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-900">الحد اليومي</h3>
              </div>
              <div className="max-w-xs">
                <input
                  type="number"
                  min={1}
                  max={1_000_000}
                  value={controls.dailyCap}
                  onChange={(e) => setControls({ ...controls, dailyCap: Math.max(1, Number(e.target.value) || 1) })}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3"
                  dir="ltr"
                />
              </div>
              {usage && (
                <div className="grid grid-cols-2 gap-2 sm:max-w-md">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-[10px] text-slate-500">المستخدم آخر 24 ساعة</div>
                    <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{usage.usedLast24h.toLocaleString("en-US")}</div>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <div className="text-[10px] text-emerald-700">المتبقي حسب الحد الحالي</div>
                    <div className="mt-0.5 text-sm font-bold tabular-nums text-emerald-800">{Math.max(controls.dailyCap - usage.usedLast24h, 0).toLocaleString("en-US")}</div>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-slate-500">الحد يُطبّق على إجمالي WhatsApp الذي قبلته Meta خلال آخر 24 ساعة، وليس على هذه الحملة وحدها.</p>
            </section>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
              <Button onClick={save} disabled={saving} className="bg-brand hover:bg-brand/90">
                {saving && <Loader2 className="me-1.5 h-4 w-4 animate-spin" />}
                حفظ
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
