"use client";

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Bot, Database, Eye, Loader2, MessageSquareText, Save, Sparkles, Target, Undo2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { cn } from "@/lib/utils";
import { TEAM_NOTES_MAX, type ConciergeSettings } from "@/lib/ai/concierge/settings-shape";
import { dateTime, num } from "./labels";

type Payload = {
  settings: ConciergeSettings;
  defaults: ConciergeSettings;
  provider: { ready: boolean; configured: boolean; externalCallsEnabled: boolean; model: string | null; reason: string };
  storage: { conversations: number; insights: number; oldestConversation: string | null };
};

export function SettingsView() {
  const [data, setData] = useState<Payload | null>(null);
  const [form, setForm] = useState<ConciergeSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/ai/concierge/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Payload) => {
        setData(d);
        setForm(d.settings);
      })
      .catch(() => toast.error("تعذّر تحميل الإعدادات"));
  }, []);

  if (!data || !form) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-brand" />
      </div>
    );
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(data.settings);
  const set = <K extends keyof ConciergeSettings>(k: K, v: ConciergeSettings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    setSaving(true);
    const r = await fetch("/api/admin/ai/concierge/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: form }) }).catch(() => null);
    setSaving(false);
    const d = r ? await r.json().catch(() => null) : null;
    if (!r?.ok || !d?.settings) return toast.error(d?.error || "تعذّر الحفظ");
    setData({ ...data, settings: d.settings });
    setForm(d.settings);
    toast.success("حُفظت الإعدادات — تظهر في الموقع خلال دقيقة");
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="الظهور في الموقع" description="زر «مساعد العطاء» العائم وما يلفت الانتباه إليه" icon={Eye}>
          <div className="divide-y divide-slate-100">
            <Toggle label="تفعيل المساعد في الموقع" hint="عند الإيقاف يختفي الزر العائم وبطاقات «ساعدني أختار» من صفحات المشاريع." checked={form.enabled} onChange={(v) => set("enabled", v)} />
            <Toggle label="نبض لافت حول الزر" hint="حلقة ذهبية تنبض حول الزر حتى يفتحه الزائر أول مرة." checked={form.pulseEnabled} onChange={(v) => set("pulseEnabled", v)} disabled={!form.enabled} />
            <Toggle label="فقاعة ترحيب بجانب الزر" hint="رسالة قصيرة تدعو الزائر لتجربة المساعد، تظهر مرة واحدة في كل زيارة ويمكن إغلاقها." checked={form.teaserEnabled} onChange={(v) => set("teaserEnabled", v)} disabled={!form.enabled} />
            <div className={cn("flex items-center justify-between gap-4 py-3", (!form.enabled || !form.teaserEnabled) && "opacity-50")}>
              <div>
                <p className="text-[13.5px] font-medium text-slate-800">تظهر الفقاعة بعد</p>
                <p className="text-[12px] text-slate-500">ثوانٍ من فتح الصفحة (0 = فورًا)</p>
              </div>
              <div className="flex items-center gap-2">
                <Input type="number" min={0} max={120} value={form.teaserDelaySeconds} onChange={(e) => set("teaserDelaySeconds", Math.max(0, Math.min(120, Number(e.target.value) || 0)))} className="h-9 w-20 text-center" disabled={!form.enabled || !form.teaserEnabled} />
                <span className="text-[12px] text-slate-500">ثانية</span>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="معاينة الزر" description="هكذا يظهر للزائر (بالعربية)" icon={Sparkles}>
          <LauncherPreview pulse={form.enabled && form.pulseEnabled} teaser={form.enabled && form.teaserEnabled} enabled={form.enabled} />
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="الذكاء الاصطناعي" description="النموذج الذي يكتب الردود على الرسائل الحرة" icon={Bot}>
          <div className={cn("mb-3 rounded-lg px-3 py-2.5 text-[12.5px] leading-6", data.provider.ready ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800")}>
            <b>{data.provider.ready ? `متصل — ${data.provider.model}` : "غير متصل"}</b>
            <br />
            {data.provider.reason}
            {!data.provider.ready && <span className="block text-[11.5px] opacity-80">يُضبط من متغيرات الخادم: OPENAI_API_KEY و AI_CORE_ENABLE_EXTERNAL_CALLS=true (و AI_CORE_OPENAI_MODEL اختياريًا).</span>}
          </div>
          <div className="divide-y divide-slate-100">
            <Toggle label="استخدام الذكاء الاصطناعي في الردود" hint="عند الإيقاف يجيب المساعد بالمسار الثابت (الأزرار والقواعد) فقط — مفيد لإيقاف التكلفة أو عند مشكلة في المزوّد." checked={form.llmEnabled} onChange={(v) => set("llmEnabled", v)} />
          </div>
        </SectionCard>

        <SectionCard title="التسجيل والإسناد" description="ما يُحفظ من المحادثات وكيف تُنسب التبرعات" icon={Database}>
          <div className="divide-y divide-slate-100">
            <Toggle label="حفظ نصوص المحادثات" hint="لعرضها في «محادثات المساعد» وتحليلها. أرقام مسار التحويل تُسجّل دائمًا بدون نصوص." checked={form.storeTranscripts} onChange={(v) => set("storeTranscripts", v)} />
            <div className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="flex items-center gap-1.5 text-[13.5px] font-medium text-slate-800">
                  <Target className="h-4 w-4 text-slate-400" /> نافذة الإسناد غير المباشر
                </p>
                <p className="text-[12px] text-slate-500">تبرع تمّ خلال هذه المدة بعد المحادثة يُحسب «غير مباشر»</p>
              </div>
              <div className="flex items-center gap-2">
                <Input type="number" min={1} max={90} value={form.attributionWindowDays} onChange={(e) => set("attributionWindowDays", Math.max(1, Math.min(90, Number(e.target.value) || 1)))} className="h-9 w-20 text-center" />
                <span className="text-[12px] text-slate-500">يوم</span>
              </div>
            </div>
          </div>
          <p className="mt-2 text-[11.5px] text-slate-500">
            محفوظ حاليًا: {num(data.storage.conversations)} محادثة و{num(data.storage.insights)} تحليل
            {data.storage.oldestConversation ? ` · أقدم محادثة ${dateTime(data.storage.oldestConversation)}` : ""}
          </p>
        </SectionCard>
      </div>

      <SectionCard
        title="ملاحظات الفريق للمساعد"
        description="حقائق وتوجيهات يستخدمها المساعد في إجاباته، سطر لكل ملاحظة. مثال: «حملة الشتاء لغزة هي الأولوية هذا الشهر» أو «الإيصال يصل بالبريد خلال 24 ساعة». لا تتجاوز قواعد المساعد الأساسية."
        icon={MessageSquareText}
      >
        <Textarea value={form.teamNotes} onChange={(e) => set("teamNotes", e.target.value.slice(0, TEAM_NOTES_MAX))} rows={8} className="text-[13px] leading-6" placeholder="اكتب هنا… (كل سطر ملاحظة مستقلة)" />
        <p className="mt-1 text-end text-[11px] text-slate-400">
          {num(form.teamNotes.length)} / {num(TEAM_NOTES_MAX)}
        </p>
      </SectionCard>

      <div className="sticky bottom-3 z-10 flex items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        {dirty && <span className="me-auto text-[12.5px] text-amber-700">لديك تغييرات غير محفوظة</span>}
        <Button variant="outline" onClick={() => setForm(data.defaults)} className="gap-1.5">
          <Undo2 className="h-4 w-4" /> القيم الافتراضية
        </Button>
        <Button onClick={save} disabled={!dirty || saving} className="gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ
        </Button>
      </div>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-center justify-between gap-4 py-3", disabled && "cursor-not-allowed opacity-50")}>
      <span>
        <span className="block text-[13.5px] font-medium text-slate-800">{label}</span>
        <span className="block text-[12px] leading-5 text-slate-500">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} dir="ltr" />
    </label>
  );
}

/** A static replica of the public launcher (see minbar.css `.cg-launcher`). */
function LauncherPreview({ pulse, teaser, enabled }: { pulse: boolean; teaser: boolean; enabled: boolean }) {
  return (
    <div className="relative flex h-[190px] items-end justify-start overflow-hidden rounded-xl border border-dashed border-slate-200 bg-[linear-gradient(135deg,#f8fafc,#eef2f7)] p-5" dir="rtl">
      {!enabled ? (
        <p className="m-auto text-[13px] text-slate-400">المساعد مخفي من الموقع</p>
      ) : (
        <div className="flex flex-col items-start gap-2">
          {teaser && (
            <div className="relative max-w-[240px] rounded-2xl rounded-es-sm bg-white px-3.5 py-2.5 text-[12.5px] leading-5 text-slate-700 shadow-lg ring-1 ring-slate-200">
              <b className="block text-[13px] text-[#10212B]">محتار أين تتبرع؟ ✨</b>
              أخبرني بما في قلبك، وأختار لك المشروع الأنسب خلال دقيقة.
            </div>
          )}
          <span className="relative inline-flex">
            {pulse && <span className="absolute inset-0 animate-ping rounded-full bg-[#D39A27]/40" />}
            <span className="relative inline-flex h-[50px] items-center gap-2.5 rounded-full border border-[#D39A27]/70 bg-[linear-gradient(135deg,#1B3A4A,#10212B)] pe-5 ps-2 text-[14px] font-black text-white shadow-[0_14px_30px_rgba(16,33,43,.35)]">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[linear-gradient(135deg,#E8B94A,#D39A27)] text-[#10212B]">
                <Sparkles className="h-[18px] w-[18px]" />
              </span>
              مساعد العطاء
              <span className="rounded-full bg-[#D39A27] px-1.5 py-0.5 text-[9.5px] font-black text-[#10212B]">AI</span>
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
