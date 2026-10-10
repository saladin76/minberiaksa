"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Check, ChevronLeft, Loader2, FileText, Languages, Users, TriangleAlert, Gauge, Zap, Moon, ShieldCheck, Tag } from "lucide-react";
import { LOCALE_LABELS } from "@/lib/locales";
import { cn } from "@/lib/utils";
import { CHANNEL_META } from "../../_components/campaign-ui";
import { SmartAudienceBuilder, type SmartAudienceDraft, type SmartAudiencePreview } from "./SmartAudienceBuilder";
import { DonorPicker } from "./DonorPicker";
import { campaignAudienceSelectionCount } from "@/lib/communication/campaign-audience-accounting";

interface TemplateSummary {
  id: string;
  name: string;
  availableLocales: string[];
}

interface AudienceListSummary {
  id: string;
  name: string;
  type: "CUSTOM" | "TEST" | "SMART";
  status: string;
  channels: string[];
  membersCount: number;
}

interface BadgeSummary {
  id: string;
  name: string;
  color: string;
}

const TIMEZONE_OPTIONS = [
  ["Europe/Istanbul", "تركيا — Istanbul"],
  ["Asia/Riyadh", "السعودية — Riyadh"],
  ["Asia/Dubai", "الإمارات — Dubai"],
  ["Asia/Jerusalem", "فلسطين / القدس"],
  ["Africa/Cairo", "مصر — Cairo"],
  ["Europe/London", "المملكة المتحدة — London"],
  ["Europe/Paris", "فرنسا — Paris"],
  ["Europe/Berlin", "ألمانيا — Berlin"],
  ["America/New_York", "أمريكا — New York"],
  ["America/Chicago", "أمريكا — Chicago"],
  ["America/Los_Angeles", "أمريكا — Los Angeles"],
  ["America/Toronto", "كندا — Toronto"],
  ["UTC", "UTC"],
] as const;

const CHANNEL_ORDER = ["EMAIL", "WHATSAPP", "SMS"] as const;
const BASE_STEPS = ["القناة", "الرسالة", "الجمهور", "اللغة"] as const;

type CampaignSendControlsDraft = {
  paused: boolean;
  speedMode: "SAFE" | "BALANCED" | "FAST" | "MAX";
  autoSpeed: boolean;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  dailyCap: number;
  scheduledStopAt: string | null;
  resumeAt: string | null;
  quietHours: { enabled: boolean; start: string; end: string; timezoneMode: "RECIPIENT" | "FIXED"; timezone: string };
};

const DEFAULT_SEND_CONTROLS: CampaignSendControlsDraft = {
  paused: false,
  speedMode: "BALANCED",
  autoSpeed: true,
  priority: "NORMAL",
  dailyCap: 100000,
  scheduledStopAt: null,
  resumeAt: null,
  quietHours: { enabled: false, start: "00:00", end: "08:00", timezoneMode: "RECIPIENT", timezone: "Europe/Istanbul" },
};


type CampaignApiJson = {
  ok?: boolean;
  error?: unknown;
  message?: unknown;
  templates?: TemplateSummary[];
  lists?: AudienceListSummary[];
  badges?: BadgeSummary[];
  dailyCap?: unknown;
  source?: unknown;
  audienceSegmentKey?: unknown;
  matched?: unknown;
  added?: unknown;
  [key: string]: unknown;
};

async function readApiJson(response: Response, fallback: string): Promise<CampaignApiJson> {
  const text = await response.text();
  let data: CampaignApiJson = {};
  if (text) {
    try {
      data = JSON.parse(text) as CampaignApiJson;
    } catch {
      const compact = text.replace(/\s+/g, " ").trim().slice(0, 180);
      throw new Error(response.ok ? fallback : `${fallback} (HTTP ${response.status})${compact ? `: ${compact}` : ""}`);
    }
  }
  if (!response.ok) {
    throw new Error(String(data.error || data.message || `${fallback} (HTTP ${response.status})`));
  }
  return data;
}

function Stepper({ step, steps }: { step: number; steps: readonly string[] }) {
  return (
    <ol className="mb-5 flex items-center gap-2">
      {steps.map((label, i) => {
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
            {i < steps.length - 1 && <span className="mx-1 h-px w-6 shrink-0 bg-slate-200 sm:w-10" />}
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
 * store is even readable, and it decides what "reachable" means for a donor  so asking for an
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
  const [audienceMode, setAudienceMode] = React.useState<"SMART" | "BADGE" | "SAVED" | "SPECIFIC">("SMART");
  const [smartPreview, setSmartPreview] = React.useState<SmartAudiencePreview | null>(null);
  const [savedLists, setSavedLists] = React.useState<AudienceListSummary[]>([]);
  const [savedListId, setSavedListId] = React.useState("");
  const [badges, setBadges] = React.useState<BadgeSummary[]>([]);
  const [badgeId, setBadgeId] = React.useState("");
  const [badgePreview, setBadgePreview] = React.useState<SmartAudiencePreview | null>(null);
  const [badgePreviewError, setBadgePreviewError] = React.useState<string | null>(null);
  const [dailyCapSource, setDailyCapSource] = React.useState<"META" | "FALLBACK">("FALLBACK");
  const [smartAudience, setSmartAudience] = React.useState<SmartAudienceDraft>({
    version: 1,
    kind: "SMART",
    channel: "WHATSAPP",
    filters: {
      countries: [],
      locales: [],
      donatedWithinDays: null,
      projectIds: [],
      badgeIds: [],
      recurringOnly: false,
      minDonationAmountUSD: null,
      hasContact: false,
    },
    excludeUserIds: [],
    fallbackLocale: "ar",
  });
  const [sendControls, setSendControls] = React.useState<CampaignSendControlsDraft>(DEFAULT_SEND_CONTROLS);
  const [saving, setSaving] = React.useState(false);

  const steps = React.useMemo(
    () => channel === "WHATSAPP" ? [...BASE_STEPS, "التحكم", "المراجعة"] : [...BASE_STEPS, "المراجعة"],
    [channel],
  );

  // Templates load on entering step 2  the channel is known by then and cannot change without
  // coming back, which also resets the choice below.
  React.useEffect(() => {
    if (!channel) return;
    setTemplatesLoading(true);
    setTemplateId("");
    fetch(`/api/communication/templates?channel=${channel}`, { cache: "no-store" })
      .then((response) => readApiJson(response, "تعذّر تحميل القوالب"))
      .then((j) => {
        if (!j.ok) throw new Error(String(j.error || "تعذّر تحميل القوالب"));
        setTemplates(j.templates ?? []);
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setTemplatesLoading(false));
  }, [channel]);

  const chosenTemplate = templates.find((t) => t.id === templateId) ?? null;

  React.useEffect(() => {
    if (!channel || !["EMAIL", "WHATSAPP", "SMS"].includes(channel)) return;
    setSmartAudience((current) => ({ ...current, channel: channel as SmartAudienceDraft["channel"] }));
    setSavedListId("");
    setBadgeId("");
    setBadgePreview(null);
    Promise.all([
      fetch("/api/communication/audience-lists", { cache: "no-store" }).then((response) => readApiJson(response, "تعذر تحميل القوائم المحفوظة")),
      fetch("/api/communication/audiences/facets", { cache: "no-store" }).then((response) => readApiJson(response, "تعذر تحميل الشارات")),
    ])
      .then(([listsData, facetsData]) => {
        const lists = (listsData.lists ?? []) as AudienceListSummary[];
        setSavedLists(lists.filter((list) => list.status === "ACTIVE" && (list.channels?.length === 0 || list.channels.includes(channel))));
        setBadges((facetsData.badges ?? []) as BadgeSummary[]);
      })
      .catch(() => {
        setSavedLists([]);
        setBadges([]);
      });

    if (channel === "WHATSAPP") {
      fetch("/api/communication/whatsapp/meta-capacity", { cache: "no-store" })
        .then((response) => readApiJson(response, "تعذر قراءة حد Meta"))
        .then((data) => {
          const cap = Number(data.dailyCap);
          if (Number.isFinite(cap) && cap > 0) {
            setSendControls((current) => ({ ...current, dailyCap: cap }));
            setDailyCapSource(data.source === "META" ? "META" : "FALLBACK");
          }
        })
        .catch(() => setDailyCapSource("FALLBACK"));
    }
  }, [channel]);

  React.useEffect(() => {
    setBadgePreview(null);
    setBadgePreviewError(null);
    if (audienceMode !== "BADGE" || !badgeId || !channel) return;
    const controller = new AbortController();
    const definition: SmartAudienceDraft = {
      ...smartAudience,
      channel: channel as SmartAudienceDraft["channel"],
      filters: { ...smartAudience.filters, badgeIds: [badgeId] },
    };
    fetch("/api/communication/audiences/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel, definition }),
      signal: controller.signal,
    })
      .then((response) => readApiJson(response, "تعذر معاينة جمهور الشارة"))
      .then((data) => {
        if (!controller.signal.aborted) setBadgePreview(data as unknown as SmartAudiencePreview);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setBadgePreview(null);
        setBadgePreviewError("تعذّر حساب جمهور الشارة. أعد المحاولة؛ الأعداد غير متاحة وليست صفرًا.");
      });
    return () => controller.abort();
  }, [audienceMode, badgeId, channel, smartAudience]);

  // Saving a draft is not permission to send. The runtime rechecks contact,
  // consent, approval, template and provider gates for the selected audience.
  const smartAudienceReady = audienceMode === "SMART" && campaignAudienceSelectionCount(channel, smartPreview) > 0;
  const badgeAudienceReady = audienceMode === "BADGE" && Boolean(badgeId) && campaignAudienceSelectionCount(channel, badgePreview) > 0;
  const savedAudienceReady = audienceMode === "SAVED" && Boolean(savedListId);
  const specificAudienceReady = audienceMode === "SPECIFIC" && selected.size > 0;
  const audienceReady = smartAudienceReady || badgeAudienceReady || savedAudienceReady || specificAudienceReady;
  const selectedSavedList = savedLists.find((list) => list.id === savedListId) ?? null;
  const activePreview = audienceMode === "BADGE" ? badgePreview : smartPreview;
  const reviewMatched = audienceMode === "SMART" || audienceMode === "BADGE"
    ? (activePreview?.matched ?? 0)
    : audienceMode === "SAVED"
      ? (selectedSavedList?.membersCount ?? 0)
      : selected.size;
  const reviewEligible = audienceMode === "SMART" || audienceMode === "BADGE" ? (activePreview?.eligible ?? 0) : null;
  const reviewLanguages = audienceMode === "SMART" || audienceMode === "BADGE"
    ? Object.entries(activePreview?.languages ?? {}).sort((a, b) => b[1] - a[1])
    : [];

  const create = async () => {
    if (!name.trim()) {
      toast.error("اسم الحملة مطلوب");
      return;
    }
    if (!audienceReady) {
      toast.error(
        audienceMode === "SMART"
          ? (channel === "WHATSAPP" ? "اختر جمهورًا مطابقًا وانتظر اكتمال المعاينة" : "لا يوجد مستلم مؤهل ضمن شروط الجمهور الحالية")
          : audienceMode === "BADGE"
            ? (channel === "WHATSAPP" ? "اختر شارة تحتوي على جمهور وانتظر اكتمال المعاينة" : "اختر شارة تحتوي على مستلمين مؤهلين")
            : audienceMode === "SAVED"
              ? "اختر قائمة محفوظة"
              : "اختر متبرعًا واحدًا على الأقل",
      );
      return;
    }
    setSaving(true);
    try {
      let audienceSegmentKey = "";
      let audienceCount = 0;

      if (audienceMode === "SAVED") {
        audienceSegmentKey = `list:${savedListId}`;
        audienceCount = savedLists.find((list) => list.id === savedListId)?.membersCount ?? 0;
      } else {
        const listRes = await fetch("/api/communication/audience-lists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            audienceMode === "SMART"
              ? { name: `جمهور ذكي: ${name.trim()}`, channel, smartDefinition: smartAudience }
              : audienceMode === "BADGE"
                ? {
                    name: `جمهور الشارة: ${badges.find((badge) => badge.id === badgeId)?.name ?? name.trim()}`,
                    channel,
                    smartDefinition: {
                      ...smartAudience,
                      channel,
                      filters: { ...smartAudience.filters, badgeIds: [badgeId] },
                    },
                  }
                : { name: `جمهور: ${name.trim()}`, channel, userIds: [...selected] },
          ),
        });
        const listJson = await readApiJson(listRes, "تعذّر إنشاء قائمة الجمهور");
        if (!listJson.ok) throw new Error(String(listJson.error || "تعذّر إنشاء قائمة الجمهور"));
        audienceSegmentKey = String(listJson.audienceSegmentKey || "");
        audienceCount = audienceMode === "SMART" || audienceMode === "BADGE"
          ? Number(listJson.matched ?? activePreview?.matched ?? 0)
          : Number(listJson.added ?? selected.size);
      }

      const res = await fetch("/api/communication/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          channel,
          purpose: "MARKETING",
          templateGroupId: templateId,
          audienceSegmentKey,
          fallbackLocale: smartAudience.fallbackLocale ?? "ar",
          ...(channel === "WHATSAPP" ? { sendControls } : {}),
        }),
      });
      const json = await readApiJson(res, "تعذّر إنشاء الحملة");
      if (!json.ok) throw new Error(String(json.error || "تعذّر إنشاء الحملة"));

      toast.success(`تم إنشاء الحملة لجمهور حجمه ${audienceCount.toLocaleString("en-US")}`);
      router.push("/dashboard/communication/campaigns");
    } catch (e) {
      toast.error((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div dir="rtl">
      <Stepper step={step} steps={steps} />

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
                  {id === "SMS" && "نص فقط، ويُحاسب بالمقطع  العربية ٧٠ حرفًا للمقطع."}
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

          {chosenTemplate && chosenTemplate.availableLocales.length < 2 && (
            <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-5 text-amber-900">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              هذا القالب متوفّر بلغة واحدة فقط. في خطوة «اللغة» ستحدد نسخة الـFallback التي تستخدم عند غياب لغة المتبرع.
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

          <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1 md:grid-cols-4">
            {([
              ["SMART", "جمهور ذكي"],
              ["BADGE", "الشارات"],
              ["SAVED", "قائمة محفوظة"],
              ["SPECIFIC", "أشخاص محددون"],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setAudienceMode(mode)}
                className={cn("rounded-lg px-3 py-2 text-xs font-semibold transition", audienceMode === mode ? "bg-white text-brand shadow-sm" : "text-slate-500")}
              >
                {label}
              </button>
            ))}
          </div>

          {audienceMode === "SMART" && (
            <SmartAudienceBuilder
              channel={channel as SmartAudienceDraft["channel"]}
              value={smartAudience}
              onChange={setSmartAudience}
              onPreview={setSmartPreview}
            />
          )}

          {audienceMode === "BADGE" && (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-brand" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">جمهور من الشارات</h3>
                  <p className="mt-1 text-xs text-slate-500" role={badgePreviewError ? "alert" : undefined}>{badgePreviewError ?? "تُحفظ كل السجلات المطابقة للشارة؛ الأهلية المبدئية لا تضمن التسليم وتُراجع عند التنفيذ."}</p>
                </div>
              </div>
              <select
                value={badgeId}
                onChange={(e) => setBadgeId(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="">اختر شارة...</option>
                {badges.map((badge) => (
                  <option key={badge.id} value={badge.id}>{badge.name}</option>
                ))}
              </select>
              {badgeId && (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <div className="rounded-lg bg-slate-50 p-3 text-xs"><span className="text-slate-500">جمهور الحملة</span><strong className="mt-1 block text-lg">{badgePreview ? badgePreview.matched.toLocaleString("en-US") : "—"}</strong></div>
                  <div className="rounded-lg bg-emerald-50 p-3 text-xs"><span className="text-emerald-700">مؤهل مبدئيًا</span><strong className="mt-1 block text-lg text-emerald-800">{badgePreview ? badgePreview.eligible.toLocaleString("en-US") : "—"}</strong></div>
                  <div className="rounded-lg bg-slate-50 p-3 text-xs"><span className="text-slate-500">بدون وسيلة اتصال</span><strong className="mt-1 block text-lg">{badgePreview ? badgePreview.missingContact.toLocaleString("en-US") : "—"}</strong></div>
                  <div className="rounded-lg bg-slate-50 p-3 text-xs" title={badgePreview ? `إيقاف التواصل: ${badgePreview.doNotContact}; مراجعة الموافقة: ${badgePreview.needsReview ?? 0}` : undefined}><span className="text-slate-500">تواصل موقوف / يحتاج مراجعة</span><strong className="mt-1 block text-lg">{badgePreview ? (badgePreview.doNotContact + (badgePreview.needsReview ?? 0)).toLocaleString("en-US") : "—"}</strong></div>
                </div>
              )}
            </div>
          )}

          {audienceMode === "SAVED" && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <label className="space-y-1.5 text-xs text-slate-600">
                <span>اختر قائمة جمهور محفوظة</span>
                <select
                  value={savedListId}
                  onChange={(e) => setSavedListId(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="">اختر قائمة...</option>
                  {savedLists.filter((list) => list.type !== "TEST").map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name}{list.type === "SMART" ? " — ذكية" : ` — ${list.membersCount.toLocaleString("en-US")} عضو`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {audienceMode === "SPECIFIC" && (
            <DonorPicker channel={channel} selected={selected} onChange={setSelected} />
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-semibold text-slate-900">قواعد اللغة</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              النظام يختار نسخة القالب حسب لغة كل متبرع تلقائيًا. لا تحتاج إلى إنشاء حملة منفصلة لكل لغة.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                <p className="font-semibold">تلقائي حسب لغة المتبرع ✓</p>
                <p className="mt-1">Arabic / Turkish / English / French وغيرها تُرسل من نفس Template Family حسب preferredLang.</p>
              </div>
              <label className="space-y-1 text-xs text-slate-600">
                <span>Fallback عند عدم وجود نسخة مطابقة</span>
                <select
                  value={smartAudience.fallbackLocale ?? "ar"}
                  onChange={(e) => setSmartAudience((current) => ({ ...current, fallbackLocale: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  {Object.entries(LOCALE_LABELS).map(([locale, label]) => (
                    <option key={locale} value={locale}>{label}</option>
                  ))}
                </select>
              </label>
            </div>

            {chosenTemplate && (
              <div className="mt-4">
                <p className="text-[11px] text-slate-500">اللغات المتاحة في القالب</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {chosenTemplate.availableLocales.map((locale) => (
                    <span key={locale} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px]">
                      {LOCALE_LABELS[locale as keyof typeof LOCALE_LABELS] ?? locale}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {step === 4 && channel === "WHATSAPP" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-brand/20 bg-brand-50/40 p-4">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-semibold text-slate-900">تحكم إرسال الحملة قبل الإنشاء</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">هذه الإعدادات تُحفظ مع الحملة من البداية، ويمكن تعديلها لاحقًا من مركز التحكم.</p>
          </div>

          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">سرعة الإرسال</h4>
                <p className="mt-1 text-xs text-slate-500">Auto Speed هو الاختيار الموصى به، ويضبط السرعة حسب الجمهور والحد اليومي.</p>
              </div>
              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={sendControls.autoSpeed}
                  onChange={(e) => setSendControls((current) => ({ ...current, autoSpeed: e.target.checked }))}
                />
                <Zap className="h-3.5 w-3.5 text-amber-500" />
                Auto Speed
              </label>
            </div>
            <div className={cn("grid grid-cols-2 gap-2 md:grid-cols-4", sendControls.autoSpeed && "opacity-50")}>
              {([
                ["SAFE", "هادئ"],
                ["BALANCED", "متوازن"],
                ["FAST", "سريع"],
                ["MAX", "أقصى سرعة آمنة"],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  disabled={sendControls.autoSpeed}
                  onClick={() => setSendControls((current) => ({ ...current, speedMode: id }))}
                  className={cn(
                    "rounded-xl border p-3 text-right text-xs disabled:cursor-not-allowed",
                    sendControls.speedMode === id ? "border-brand bg-brand/5 ring-1 ring-brand/20" : "border-slate-200 hover:bg-slate-50",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <h4 className="text-sm font-semibold text-slate-900">أولوية الحملة</h4>
            <select
              value={sendControls.priority}
              onChange={(e) => setSendControls((current) => ({ ...current, priority: e.target.value as CampaignSendControlsDraft["priority"] }))}
              className="h-10 w-full max-w-sm rounded-lg border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="LOW">منخفضة</option>
              <option value="NORMAL">عادية</option>
              <option value="HIGH">عالية</option>
              <option value="URGENT">عاجلة</option>
            </select>
          </section>

          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <Moon className="h-4 w-4 text-slate-500" />
              <h4 className="text-sm font-semibold text-slate-900">ساعات عدم الإرسال</h4>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={sendControls.quietHours.enabled}
                onChange={(e) => setSendControls((current) => ({ ...current, quietHours: { ...current.quietHours, enabled: e.target.checked } }))}
              />
              تفعيل ساعات عدم الإرسال
            </label>
            {sendControls.quietHours.enabled && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSendControls((current) => ({ ...current, quietHours: { ...current.quietHours, timezoneMode: "RECIPIENT" } }))}
                    className={cn("rounded-lg border p-3 text-right text-xs", sendControls.quietHours.timezoneMode === "RECIPIENT" ? "border-brand bg-brand/5 ring-1 ring-brand/20" : "border-slate-200")}
                  >
                    <strong className="block">تلقائي حسب المتبرع</strong>
                    <span className="mt-1 block text-[11px] text-slate-500">يحدد دولة الرقم/المتبرع ويطبق الساعات على توقيته المحلي.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSendControls((current) => ({ ...current, quietHours: { ...current.quietHours, timezoneMode: "FIXED" } }))}
                    className={cn("rounded-lg border p-3 text-right text-xs", sendControls.quietHours.timezoneMode === "FIXED" ? "border-brand bg-brand/5 ring-1 ring-brand/20" : "border-slate-200")}
                  >
                    <strong className="block">توقيت ثابت</strong>
                    <span className="mt-1 block text-[11px] text-slate-500">استخدم منطقة زمنية واحدة لكل الجمهور.</span>
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs text-slate-600"><span>من</span><input type="time" value={sendControls.quietHours.start} onChange={(e) => setSendControls((current) => ({ ...current, quietHours: { ...current.quietHours, start: e.target.value } }))} className="h-10 w-full rounded-lg border border-slate-200 px-3" /></label>
                  <label className="space-y-1 text-xs text-slate-600"><span>إلى</span><input type="time" value={sendControls.quietHours.end} onChange={(e) => setSendControls((current) => ({ ...current, quietHours: { ...current.quietHours, end: e.target.value } }))} className="h-10 w-full rounded-lg border border-slate-200 px-3" /></label>
                </div>
                <label className="block space-y-1 text-xs text-slate-600">
                  <span>{sendControls.quietHours.timezoneMode === "RECIPIENT" ? "التوقيت الاحتياطي عند تعذر تحديد الدولة" : "المنطقة الزمنية"}</span>
                  <select
                    value={sendControls.quietHours.timezone}
                    onChange={(e) => setSendControls((current) => ({ ...current, quietHours: { ...current.quietHours, timezone: e.target.value } }))}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  >
                    {TIMEZONE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-slate-500" />
              <h4 className="text-sm font-semibold text-slate-900">الحد اليومي</h4>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="number"
                min={1}
                max={1_000_000}
                value={sendControls.dailyCap}
                onChange={(e) => {
                  setDailyCapSource("FALLBACK");
                  setSendControls((current) => ({ ...current, dailyCap: Math.max(1, Number(e.target.value) || 1) }));
                }}
                className="h-10 w-full max-w-sm rounded-lg border border-slate-200 px-3"
                dir="ltr"
              />
              <span className={cn("rounded-full px-2 py-1 text-[11px]", dailyCapSource === "META" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>
                {dailyCapSource === "META" ? "مقروء تلقائيًا من Meta" : "قيمة احتياطية / تعديل يدوي"}
              </span>
            </div>
          </section>
        </div>
      )}


      {((step === 4 && channel !== "WHATSAPP") || (step === 5 && channel === "WHATSAPP")) && (
        <div className="space-y-4">
          <div className="rounded-xl border border-brand/20 bg-brand-50/40 p-4">
            <h3 className="text-sm font-semibold text-slate-900">مراجعة الحملة قبل الإنشاء</h3>
            <p className="mt-1 text-xs text-slate-500">لن يتم الإرسال الآن. سيتم إنشاء الحملة كمسودة للمراجعة والاعتماد؛ حجم الجمهور لا يعني أن كل السجلات مؤهلة أو أن الرسائل سُلّمت.</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] text-slate-500">الحملة</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{name || "—"}</p>
              <p className="mt-2 text-xs text-slate-600">القناة: {CHANNEL_META[channel as keyof typeof CHANNEL_META]?.label ?? channel}</p>
              <p className="mt-1 text-xs text-slate-600">القالب: {chosenTemplate?.name ?? "—"}</p>
              <p className="mt-1 text-xs text-slate-600">نوع الجمهور: {audienceMode === "SMART" ? "جمهور ذكي" : audienceMode === "BADGE" ? "شارة" : audienceMode === "SAVED" ? "قائمة محفوظة" : "أشخاص محددون"}</p>
              <p className="mt-1 text-xs text-slate-600">Fallback: {LOCALE_LABELS[(smartAudience.fallbackLocale ?? "ar") as keyof typeof LOCALE_LABELS] ?? smartAudience.fallbackLocale ?? "ar"}</p>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] text-slate-500">الجمهور</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-[10px] text-slate-500">جمهور الحملة</p>
                  <p className="text-lg font-bold">{reviewMatched.toLocaleString("en-US")}</p>
                </div>
                <div className="rounded-lg bg-emerald-50 p-3">
                  <p className="text-[10px] text-emerald-700">مؤهل مبدئيًا</p>
                  <p className="text-lg font-bold text-emerald-800">{reviewEligible === null ? "يُفحص عند التنفيذ" : reviewEligible.toLocaleString("en-US")}</p>
                </div>
              </div>
              {(audienceMode === "SMART" || audienceMode === "BADGE") && (
                <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                  <p>بدون وسيلة اتصال: {(activePreview?.missingContact ?? 0).toLocaleString("en-US")}</p>
                  <p>إيقاف التواصل: {(activePreview?.doNotContact ?? 0).toLocaleString("en-US")}؛ مراجعة الموافقة: {(activePreview?.needsReview ?? 0).toLocaleString("en-US")}</p>
                  <p>استثناءات يدوية: {(smartAudience.excludeUserIds?.length ?? 0).toLocaleString("en-US")}</p>
                </div>
              )}
            </section>
          </div>

          {reviewLanguages.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h4 className="text-sm font-semibold text-slate-900">توزيع اللغات</h4>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {reviewLanguages.map(([locale, count]) => (
                  <div key={locale} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                    <p className="text-[11px] text-slate-500">{LOCALE_LABELS[locale as keyof typeof LOCALE_LABELS] ?? locale}</p>
                    <p className="mt-1 text-sm font-semibold">{count.toLocaleString("en-US")}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {channel === "WHATSAPP" && (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h4 className="text-sm font-semibold text-slate-900">إعدادات الإرسال</h4>
              <div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                <p>Auto Speed: {sendControls.autoSpeed ? "مفعّل" : "متوقف"}</p>
                <p>الأولوية: {sendControls.priority}</p>
                <p>الحد اليومي: {sendControls.dailyCap.toLocaleString("en-US")}</p>
                <p>ساعات عدم الإرسال: {sendControls.quietHours.enabled ? `${sendControls.quietHours.start} — ${sendControls.quietHours.end} (${sendControls.quietHours.timezoneMode === "RECIPIENT" ? "حسب المتبرع" : sendControls.quietHours.timezone})` : "غير مفعلة"}</p>
              </div>
            </section>
          )}
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
          <Button onClick={() => setStep(3)} disabled={!audienceReady || !name.trim()} className="bg-brand hover:bg-brand/90">
            التالي: قواعد اللغة
          </Button>
        )}
        {step === 3 && channel === "WHATSAPP" && (
          <Button onClick={() => setStep(4)} disabled={saving} className="gap-1.5 bg-brand hover:bg-brand/90">
            <Gauge className="h-4 w-4" />
            التالي: إعداد الإرسال
          </Button>
        )}
        {step === 3 && channel !== "WHATSAPP" && (
          <Button onClick={() => setStep(4)} disabled={saving} className="bg-brand hover:bg-brand/90">
            التالي: المراجعة
          </Button>
        )}
        {step === 4 && channel === "WHATSAPP" && (
          <Button onClick={() => setStep(5)} disabled={saving} className="bg-brand hover:bg-brand/90">
            التالي: المراجعة
          </Button>
        )}
        {((step === 4 && channel !== "WHATSAPP") || (step === 5 && channel === "WHATSAPP")) && (
          <Button onClick={create} disabled={saving} className="gap-1.5 bg-brand hover:bg-brand/90">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            إنشاء الحملة
          </Button>
        )}
      </div>
    </div>
  );
}
