"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Check, ChevronLeft, Loader2, FileText, Languages, Users, TriangleAlert } from "lucide-react";
import { LOCALE_LABELS } from "@/lib/locales";
import { cn } from "@/lib/utils";
import { CHANNEL_META } from "../../_components/campaign-ui";
import { DonorPicker } from "./DonorPicker";

interface TemplateSummary {
  id: string;
  name: string;
  availableLocales: string[];
}

const CHANNEL_ORDER = ["EMAIL", "WHATSAPP", "SMS"] as const;
const STEPS = ["القناة", "القالب", "الجمهور"] as const;

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-5 flex items-center gap-2">
      {STEPS.map((label, i) => {
        const state = i < step ? "done" : i === step ? "current" : "todo";
        return (
          <li key={label} className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                state === "done" && "bg-brand text-white",
                state === "current" && "bg-brand text-white ring-4 ring-brand/15",
                state === "todo" && "bg-slate-200 text-slate-500",
              )}
            >
              {state === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={cn("truncate text-xs", state === "todo" ? "text-slate-400" : "font-medium text-slate-800")}>
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 shrink-0 bg-slate-200 sm:w-10" />}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Create a campaign: channel → template → audience.
 *
 * The order is forced because each step constrains the next. The channel decides which template
 * store is even readable, and it decides what "reachable" means for a donor — so asking for an
 * audience first would mean collecting a list that the channel might then invalidate wholesale.
 *
 * Nothing is written until the final step. The campaign row, the audience list, and the link
 * between them are created together at the end, so abandoning the wizard halfway leaves no orphan
 * DRAFT campaigns and no unused audience lists behind.
 */
export function NewCampaignWizard() {
  const router = useRouter();
  const [step, setStep] = React.useState(0);

  const [channel, setChannel] = React.useState<string>("");
  const [templates, setTemplates] = React.useState<TemplateSummary[]>([]);
  const [templatesLoading, setTemplatesLoading] = React.useState(false);
  const [templateId, setTemplateId] = React.useState("");
  const [name, setName] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [saving, setSaving] = React.useState(false);

  // Templates load on entering step 2 — the channel is known by then and cannot change without
  // coming back, which also resets the choice below.
  React.useEffect(() => {
    if (!channel) return;
    setTemplatesLoading(true);
    setTemplateId("");
    fetch(`/api/communication/templates?channel=${channel}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.error || "تعذّر تحميل القوالب");
        setTemplates(j.templates ?? []);
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setTemplatesLoading(false));
  }, [channel]);

  const chosenTemplate = templates.find((t) => t.id === templateId) ?? null;

  const create = async () => {
    if (!name.trim()) {
      toast.error("اسم الحملة مطلوب");
      return;
    }
    if (selected.size === 0) {
      toast.error("اختر متبرعًا واحدًا على الأقل");
      return;
    }
    setSaving(true);
    try {
      // 1. The selection becomes a reusable audience list, which is what the send pipeline reads.
      const listRes = await fetch("/api/communication/audience-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `جمهور: ${name.trim()}`, channel, userIds: [...selected] }),
      });
      const listJson = await listRes.json();
      if (!listRes.ok || !listJson.ok) throw new Error(listJson?.error || "تعذّر إنشاء قائمة الجمهور");

      // 2. Then the campaign, pointed at that list. Created as DRAFT — sending is a separate,
      //    explicitly approved act on the campaign page.
      const res = await fetch("/api/communication/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          channel,
          purpose: "MARKETING",
          templateGroupId: templateId,
          audienceSegmentKey: listJson.audienceSegmentKey,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error || "تعذّر إنشاء الحملة");

      toast.success(`تم إنشاء الحملة بـ ${listJson.added} متبرعًا`);
      // Back to the list: a brand-new campaign is a DRAFT with no sends, so the
      // channel report would be empty, and the list is where it gets confirmed.
      router.push("/dashboard/communication/campaigns");
    } catch (e) {
      toast.error((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div dir="rtl">
      <Stepper step={step} />

      {step === 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {CHANNEL_ORDER.map((id) => {
            const m = CHANNEL_META[id];
            const Icon = m.icon;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setChannel(id);
                  setStep(1);
                }}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-start transition-all hover:-translate-y-0.5 hover:shadow-md",
                  channel === id ? "border-brand bg-brand-50" : "border-slate-200 bg-white hover:border-brand/40",
                )}
              >
                <span className={cn("grid h-10 w-10 place-items-center rounded-lg", m.tile)}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold text-slate-900">{m.label}</span>
                <span className="text-[11px] leading-5 text-slate-500">
                  {id === "EMAIL" && "موضوع ومحتوى كامل، ويدعم الفتح والنقر في التقارير."}
                  {id === "WHATSAPP" && "يتطلّب قالبًا معتمدًا من Meta وموافقة صريحة من المتبرع."}
                  {id === "SMS" && "نص فقط، ويُحاسب بالمقطع — العربية ٧٠ حرفًا للمقطع."}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          {templatesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="لا توجد قوالب لهذه القناة"
              description="أنشئ قالبًا من صفحة «قوالب البريد والمحفّزات» أولًا، ثم عُد لإنشاء الحملة."
              action={
                <Button variant="outline" size="sm" onClick={() => setStep(0)}>
                  اختر قناة أخرى
                </Button>
              }
            />
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
                        on ? "border-brand bg-brand-50" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                      )}
                    >
                      <span className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border", on ? "border-brand bg-brand text-white" : "border-slate-300")}>
                        {on && <Check className="h-2.5 w-2.5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-slate-900">{t.name}</p>
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

          {/* Stated before the audience is chosen, because it is what the audience step implies:
              a donor whose language the template lacks still receives it, in Arabic. */}
          {chosenTemplate && chosenTemplate.availableLocales.length < 2 && (
            <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-5 text-amber-900">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              هذا القالب متوفّر بلغة واحدة فقط. المتبرعون بلغات أخرى سيستلمونه بالنسخة الافتراضية
              (العربية) — أضف ترجمات للقالب إن أردت أن يصل كلٌّ بلغته.
            </p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">اسم الحملة (داخلي)</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: حملة رمضان — المتبرعون النشطون" />
          </div>
          <DonorPicker channel={channel} selected={selected} onChange={setSelected} />
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-200 pt-4">
        <Button
          variant="outline"
          onClick={() => (step === 0 ? router.push("/dashboard/communication/campaigns") : setStep(step - 1))}
          disabled={saving}
          className="gap-1.5"
        >
          <ChevronLeft className="h-4 w-4 rotate-180" />
          {step === 0 ? "إلغاء" : "السابق"}
        </Button>

        {step === 1 && (
          <Button onClick={() => setStep(2)} disabled={!templateId} className="bg-brand hover:bg-brand/90">
            التالي: اختيار الجمهور
          </Button>
        )}
        {step === 2 && (
          <Button onClick={create} disabled={saving || selected.size === 0 || !name.trim()} className="gap-1.5 bg-brand hover:bg-brand/90">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            إنشاء الحملة ({selected.size})
          </Button>
        )}
      </div>
    </div>
  );
}
