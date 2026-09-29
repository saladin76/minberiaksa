"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, ChevronLeft, FileText, Languages, Loader2, Mail, Megaphone, Sparkles, TriangleAlert, Users, Video } from "lucide-react";
import { LOCALE_LABELS } from "@/lib/locales";
import { cn } from "@/lib/utils";

interface UpdateContext {
  update: {
    id: string;
    title: string;
    description: string;
    image: string | null;
    videoUrl: string | null;
    createdAt: string;
    campaignId: string;
    campaignTitle: string;
  };
  donors: number;
  audienceCap: number;
  templates: Array<{ id: string; name: string; availableLocales: string[]; usesUpdate: boolean }>;
}

const STEPS = ["التحديث", "القالب", "الجمهور"] as const;

/**
 * Create an email campaign from a campaign update  "show the donors what
 * their giving did". The same wizard shape as a new campaign, with the
 * channel fixed to email and the audience fixed to everyone who made a
 * settled donation to the project. The result is an ordinary DRAFT campaign
 * on the campaigns page: confirmed, then sent or scheduled from there.
 */
export function UpdateCampaignWizard({ updateId }: { updateId: string }) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [data, setData] = React.useState<UpdateContext | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [templateId, setTemplateId] = React.useState("");
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [creatingTemplate, setCreatingTemplate] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/communication/update-campaigns?updateId=${encodeURIComponent(updateId)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error || "تعذّر تحميل التحديث");
      setData(json);
      setName((current) => current || `تحديث: ${json.update.title}`.slice(0, 160));
      setTemplateId((current) => current || json.templates.find((t: { usesUpdate: boolean }) => t.usesUpdate)?.id || "");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [updateId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const createStarter = async () => {
    setCreatingTemplate(true);
    try {
      const res = await fetch("/api/communication/update-campaigns/starter-template", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error || "تعذّر إنشاء القالب");
      toast.success("تم إنشاء قالب «تحديث مشروع»  يمكنك تعديله من صفحة القوالب");
      setTemplateId(json.template.id);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreatingTemplate(false);
    }
  };

  const create = async () => {
    if (!data || !templateId || !name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/communication/update-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updateId, templateId, name: name.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error || "تعذّر إنشاء الحملة");
      toast.success(`تم إنشاء الحملة لـ ${json.added} متبرعًا  راجعها وأكّدها ثم أرسلها من قائمة الحملات`);
      router.push("/dashboard/communication/campaigns");
    } catch (e) {
      toast.error((e as Error).message);
      setSaving(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-2" dir="rtl">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
        ))}
      </div>
    );
  }
  if (!data) {
    return (
      <div dir="rtl" className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
        تعذّر العثور على التحديث.{" "}
        <Link href="/dashboard/communication/campaigns/new" className="font-semibold text-brand underline">
          إنشاء حملة عادية
        </Link>
      </div>
    );
  }

  const { update, donors, audienceCap, templates } = data;
  const chosen = templates.find((t) => t.id === templateId) ?? null;
  const hasUpdateTemplate = templates.some((t) => t.usesUpdate);

  return (
    <div dir="rtl">
      <ol className="mb-5 flex items-center gap-2">
        {STEPS.map((label, i) => {
          const state = i < step ? "done" : i === step ? "current" : "todo";
          return (
            <li key={label} className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                  state !== "todo" ? "bg-brand text-white" : "bg-slate-200 text-slate-500",
                  state === "current" && "ring-4 ring-brand/15"
                )}
              >
                {state === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn("truncate text-xs", state === "todo" ? "text-slate-400" : "font-medium text-slate-800")}>{label}</span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 shrink-0 bg-slate-200 sm:w-10" />}
            </li>
          );
        })}
      </ol>

      {step === 0 && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-brand/20 bg-brand-50 p-3 text-[12px] leading-6 text-slate-700">
            <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            حملة بريد تسويقية تُرسل هذا التحديث إلى كل من تبرّع لمشروع «{update.campaignTitle}» تبرعًا مؤكدًا، ليرى أثر عطائه. تُنشأ كمسودة
            في قائمة الحملات، وتُراجع وتُؤكَّد ثم تُرسل أو تُجدول من هناك.
          </div>
          <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {update.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={update.image} alt="" className="h-48 w-full object-cover" />
            ) : null}
            <div className="space-y-2 p-4">
              <p className="text-[11px] font-semibold text-amber-700">
                {update.campaignTitle} · {new Date(update.createdAt).toLocaleDateString("ar")}
              </p>
              <h3 className="text-base font-bold text-slate-900">{update.title}</h3>
              <p className="whitespace-pre-line text-[13px] leading-6 text-slate-600">{update.description}</p>
              {update.videoUrl ? (
                <p className="flex items-center gap-1.5 text-[12px] text-slate-500">
                  <Video className="h-3.5 w-3.5" /> يتضمن فيديو  يظهر في البريد كصورة وزر «شاهد الفيديو»
                </p>
              ) : null}
            </div>
          </article>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          {!hasUpdateTemplate && (
            <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] leading-6 text-amber-900 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-start gap-1.5">
                <TriangleAlert className="mt-1 h-3.5 w-3.5 shrink-0" />
                لا يوجد قالب يستخدم متغيرات التحديث بعد. أنشئ القالب الجاهز (عربي وإنجليزي) ثم عدّله كما تريد، أو صمّم قالبك من صفحة القوالب
                وضع فيه متغيرات «تحديث المشروع» مثل {"{{update.title}}"} و{"{{update.image}}"}.
              </span>
              <Button size="sm" onClick={createStarter} disabled={creatingTemplate} className="shrink-0 gap-1.5 bg-brand hover:bg-brand/90">
                {creatingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                إنشاء القالب الجاهز
              </Button>
            </div>
          )}

          {templates.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              <FileText className="h-6 w-6" />
              لا توجد قوالب بريد بعد.
            </div>
          ) : (
            <ul className="space-y-2">
              {templates.map((t) => {
                const on = templateId === t.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setTemplateId(t.id)}
                      aria-pressed={on}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg border p-3 text-start transition-colors",
                        on ? "border-brand bg-brand-50" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      )}
                    >
                      <span className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border", on ? "border-brand bg-brand text-white" : "border-slate-300")}>
                        {on && <Check className="h-2.5 w-2.5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-slate-900">
                          <span className="truncate">{t.name}</span>
                          {t.usesUpdate ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">قالب تحديثات</span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">لا يعرض محتوى التحديث</span>
                          )}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                          <Languages className="h-3 w-3" />
                          {t.availableLocales.map((l) => (
                            <span key={l} className="rounded border border-slate-200 bg-white px-1 text-[10px]">
                              {LOCALE_LABELS[l as keyof typeof LOCALE_LABELS] ?? l}
                            </span>
                          ))}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-[11px] text-slate-500">
            لتعديل تصميم القالب أو مكان العنوان والنص والصورة والفيديو فيه:{" "}
            <Link href="/dashboard/templates" target="_blank" className="font-semibold text-brand underline">
              صفحة القوالب
            </Link>{" "}
            ← قالب البريد ← متغيرات «تحديث المشروع».
          </p>
          {chosen && !chosen.usesUpdate && (
            <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-5 text-amber-900">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              هذا القالب لا يحتوي متغيرات التحديث، فلن يظهر عنوان التحديث ولا صورته في الرسالة.
            </p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">اسم الحملة (داخلي)</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand">
              <Users className="h-5 w-5" />
            </span>
            <div className="space-y-1 text-[13px] text-slate-700">
              <p className="font-semibold text-slate-900">كل متبرعي «{update.campaignTitle}»</p>
              <p>
                <b className="text-slate-900">{donors.toLocaleString("ar")}</b> متبرعًا لهم تبرع مؤكد لهذا المشروع. تُحفظ قائمة جمهور باسم المشروع في «قوائم
                الجمهور»، ويستلم كلٌّ الرسالة بلغته المفضلة. من لم يوافق على رسائل البريد يُتخطّى تلقائيًا عند الإرسال.
              </p>
              {donors > audienceCap && (
                <p className="flex items-start gap-1.5 text-[12px] text-amber-800">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  حدّ قوائم الجمهور {audienceCap.toLocaleString("ar")} متبرع؛ ستضم الحملة أول {audienceCap.toLocaleString("ar")} منهم.
                </p>
              )}
              {donors === 0 && <p className="text-[12px] text-red-700">لا يوجد متبرعون لهذا المشروع بعد  لا يمكن إنشاء الحملة.</p>}
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-200 pt-4">
        <Button
          variant="outline"
          onClick={() => (step === 0 ? router.back() : setStep(step - 1))}
          disabled={saving}
          className="gap-1.5"
        >
          <ChevronLeft className="h-4 w-4 rotate-180" />
          {step === 0 ? "رجوع" : "السابق"}
        </Button>
        {step === 0 && (
          <Button onClick={() => setStep(1)} className="gap-1.5 bg-brand hover:bg-brand/90">
            <Mail className="h-4 w-4" />
            التالي: اختيار القالب
          </Button>
        )}
        {step === 1 && (
          <Button onClick={() => setStep(2)} disabled={!templateId} className="bg-brand hover:bg-brand/90">
            التالي: الجمهور
          </Button>
        )}
        {step === 2 && (
          <Button onClick={create} disabled={saving || !name.trim() || donors === 0 || !templateId} className="gap-1.5 bg-brand hover:bg-brand/90">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
            إنشاء الحملة ({Math.min(donors, audienceCap).toLocaleString("ar")})
          </Button>
        )}
      </div>
    </div>
  );
}
