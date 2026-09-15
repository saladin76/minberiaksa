"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { ExternalLink, HeartHandshake, Loader2, Plus, RefreshCw, Save, Search, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/dashboard/client-error-message";
import { parseAmountsInput } from "@/lib/campaign/suggested-donations";
import { SUPPORTED_CURRENCY_OPTIONS } from "@/lib/supported-currencies";
import { SUPPORTED_LOCALES } from "@/lib/locales";
import type { CartFreqKey } from "@/lib/minbar/cart";
import {
  DEFAULT_QUICK_DONATION,
  QUICK_FREQUENCIES,
  QUICK_GENERIC_DESTINATIONS,
  QUICK_MAX_AMOUNTS,
  QUICK_MIN_AMOUNTS,
  type QuickDonationConfig,
  type QuickGenericDestination,
  type QuickProjectsMode,
} from "@/lib/minbar/quick-donation";
import {
  ContentTranslationTabs,
  emptyTranslations,
  type TranslationMap,
} from "../_components/ContentTranslationTabs";

/**
 * The homepage quick-donation card and its dock, end to end: whether it shows,
 * the presets (USD, with per-currency overrides the way the campaign form
 * offers them), which one is suggested, the free field, the frequencies, the
 * destinations in the select, and the title per language.
 *
 * One document, one Save. The form keeps the config in the shape the API
 * stores, except for two things the admin types as text — the preset lists —
 * which are parsed on save the way the campaign form parses them.
 */

const FREQ_LABEL: Record<CartFreqKey, string> = {
  once: "تبرع لمرة",
  daily: "يوميًا",
  friday: "كل جمعة",
  monthly: "شهريًا",
};

const GENERIC_LABEL: Record<QuickGenericDestination, string> = {
  "where-needed": "حيث الحاجة أشد",
  zakat: "الزكاة",
  waqf: "الوقف",
  "gaza-relief": "إغاثة غزة",
};

const TITLE_FIELDS = [{ name: "title", label: "عنوان البطاقة" }] as const;

type CurrencyRow = { id: string; currency: string; amountsStr: string };
const rowId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type CampaignOption = { id: string; title: string; isActive: boolean };

/** Every campaign, active or not — an admin may pre-list one about to launch. */
function useCampaignOptions() {
  const [options, setOptions] = useState<CampaignOption[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    (async () => {
      const out: CampaignOption[] = [];
      for (let page = 1; page <= 5; page++) {
        try {
          const res = await axios.get("/api/campaigns", { params: { limit: 100, page, includeInactive: true } });
          const items = (res.data?.items ?? []) as CampaignOption[];
          out.push(...items.map((c) => ({ id: c.id, title: c.title, isActive: c.isActive !== false })));
          if (!res.data?.hasMore) break;
        } catch {
          break;
        }
      }
      if (live) {
        setOptions(out);
        setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  return { options, loading };
}

export default function QuickDonationSettingsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<QuickDonationConfig>(DEFAULT_QUICK_DONATION);
  const [amountsStr, setAmountsStr] = useState(DEFAULT_QUICK_DONATION.amounts.join(", "));
  const [rows, setRows] = useState<CurrencyRow[]>([]);
  const [titleAr, setTitleAr] = useState("");
  const [titles, setTitles] = useState<TranslationMap>(() => emptyTranslations(TITLE_FIELDS));
  const [projectQuery, setProjectQuery] = useState("");
  const { options: campaigns, loading: campaignsLoading } = useCampaignOptions();

  const set = <K extends keyof QuickDonationConfig>(key: K, v: QuickDonationConfig[K]) =>
    setConfig((prev) => ({ ...prev, [key]: v }));

  const hydrate = (c: QuickDonationConfig) => {
    setConfig(c);
    setAmountsStr(c.amounts.join(", "));
    setRows(Object.entries(c.byCurrency).map(([currency, amounts]) => ({ id: rowId(), currency, amountsStr: amounts.join(", ") })));
    setTitleAr(c.titles.ar ?? "");
    const map = emptyTranslations(TITLE_FIELDS);
    for (const locale of SUPPORTED_LOCALES) {
      if (locale !== "ar" && map[locale]) map[locale].title = c.titles[locale] ?? "";
    }
    setTitles(map);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/quick-donation");
      hydrate(res.data.config as QuickDonationConfig);
    } catch (e) {
      toast({ title: "خطأ", description: errorMessage(e, "تعذّر تحميل الإعدادات"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* The presets as typed, parsed live so the "suggested" picker and the
     counter follow the text field. */
  const amounts = useMemo(() => parseAmountsInput(amountsStr).slice(0, QUICK_MAX_AMOUNTS), [amountsStr]);
  const suggestedIndex = Math.min(config.suggestedIndex, Math.max(amounts.length - 1, 0));

  const shownFrequencies = config.frequencies;
  const shownGeneric = config.genericDestinations;

  const filteredCampaigns = useMemo(() => {
    const q = projectQuery.trim().toLowerCase();
    return q ? campaigns.filter((c) => c.title.toLowerCase().includes(q)) : campaigns;
  }, [campaigns, projectQuery]);

  /* Options for the default-destination picker: exactly what the visitor sees. */
  const destinationOptions = useMemo(() => {
    const generic = shownGeneric.map((id) => ({ id, label: GENERIC_LABEL[id], project: false }));
    const projects =
      config.projectsMode === "all"
        ? campaigns
        : config.projectsMode === "selected"
          ? campaigns.filter((c) => config.projectIds.includes(c.id))
          : [];
    return [...generic, ...projects.map((c) => ({ id: c.id, label: c.title, project: true }))];
  }, [shownGeneric, config.projectsMode, config.projectIds, campaigns]);

  const toggleFrequency = (f: CartFreqKey, on: boolean) => {
    const next = QUICK_FREQUENCIES.filter((x) => (x === f ? on : shownFrequencies.includes(x)));
    setConfig((prev) => ({
      ...prev,
      frequencies: next,
      defaultFrequency: next.includes(prev.defaultFrequency) ? prev.defaultFrequency : (next[0] ?? prev.defaultFrequency),
    }));
  };

  const toggleGeneric = (g: QuickGenericDestination, on: boolean) => {
    set("genericDestinations", QUICK_GENERIC_DESTINATIONS.filter((x) => (x === g ? on : shownGeneric.includes(x))));
  };

  const toggleProject = (id: string, on: boolean) => {
    set("projectIds", on ? [...config.projectIds, id] : config.projectIds.filter((x) => x !== id));
  };

  const save = async () => {
    if (amounts.length < QUICK_MIN_AMOUNTS) {
      return toast({ title: "المبالغ", description: `أدخل ${QUICK_MIN_AMOUNTS} مبالغ على الأقل`, variant: "destructive" });
    }
    const byCurrency: Record<string, number[]> = {};
    for (const r of rows) {
      const code = r.currency.trim().toUpperCase();
      const arr = parseAmountsInput(r.amountsStr);
      if (code && arr.length) byCurrency[code] = arr;
    }
    const titleMap: Record<string, string> = {};
    if (titleAr.trim()) titleMap.ar = titleAr.trim();
    for (const [locale, fields] of Object.entries(titles)) {
      if (fields.title?.trim()) titleMap[locale] = fields.title.trim();
    }
    const payload: QuickDonationConfig = { ...config, amounts, byCurrency, suggestedIndex, titles: titleMap };

    setSaving(true);
    try {
      const res = await axios.put("/api/quick-donation", { config: payload });
      hydrate(res.data.config as QuickDonationConfig);
      toast({ title: "تم الحفظ", description: "تُطبَّق الإعدادات على الصفحة الرئيسية فورًا" });
    } catch (e) {
      toast({ title: "لم يُحفظ", description: errorMessage(e, "تعذّر حفظ الإعدادات"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6" dir="rtl">
      <PageHeader
        title="التبرع السريع"
        description="بطاقة التبرع السريع في الصفحة الرئيسية والشريط الذي يتبعها — المبالغ، التكرار، الوجهات، والعنوان"
        icon={HeartHandshake}
        actions={
          <>
            <Button variant="outline" asChild>
              <a href="/ar#quick" target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 ms-2" />
                عرض في الموقع
              </a>
            </Button>
            <Button variant="outline" onClick={load} disabled={saving}>
              <RefreshCw className="h-4 w-4 ms-2" />
              تحديث
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 ms-2 animate-spin" /> : <Save className="h-4 w-4 ms-2" />}
              حفظ الإعدادات
            </Button>
          </>
        }
      />

      {/* ── Where it shows ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>الظهور</CardTitle>
          <CardDescription>البطاقة في الصفحة، والشريط الذي يظهر أسفل الشاشة بعد تجاوزها</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <ToggleRow label="إظهار البطاقة" hint="إيقافها يخفي البطاقة والشريط معًا" checked={config.enabled} onChange={(v) => set("enabled", v)} />
          <ToggleRow label="الشريط على الحاسوب" hint="شريط عائم أسفل الشاشة" checked={config.dockDesktop} onChange={(v) => set("dockDesktop", v)} disabled={!config.enabled} />
          <ToggleRow label="الشريط على الجوال" hint="شريط ثابت أسفل الشاشة" checked={config.dockMobile} onChange={(v) => set("dockMobile", v)} disabled={!config.enabled} />
        </CardContent>
      </Card>

      {/* ── Amounts ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>المبالغ المقترحة</CardTitle>
          <CardDescription>
            من {QUICK_MIN_AMOUNTS} إلى {QUICK_MAX_AMOUNTS} مبالغ بالدولار. تُحوَّل تلقائيًا لعملة الزائر ما لم تضف قيمًا خاصة بعملته أدناه.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <Label htmlFor="qd-amounts">المبالغ (USD)</Label>
              <Input
                id="qd-amounts"
                className="mt-1.5 font-mono text-left"
                dir="ltr"
                value={amountsStr}
                onChange={(e) => setAmountsStr(e.target.value)}
                placeholder="100, 300, 500, 700"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                أرقام مفصولة بفاصلة أو مسافة · {amounts.length} من {QUICK_MAX_AMOUNTS}
                {amounts.length < QUICK_MIN_AMOUNTS ? " — أضف المزيد" : ""}
              </p>
            </div>
            <div>
              <Label>المبلغ المقترح</Label>
              <Select value={String(suggestedIndex)} onValueChange={(v) => set("suggestedIndex", Number(v))} disabled={!amounts.length}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {amounts.map((a, i) => (
                    <SelectItem key={`${a}-${i}`} value={String(i)}>
                      <span dir="ltr">${a}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1.5">يُعلَّم «مبلغ مقترح» ويكون محددًا مسبقًا</p>
            </div>
          </div>

          <ToggleRow label="حقل «مبلغ آخر»" hint="يسمح للزائر بكتابة مبلغ حر" checked={config.allowCustomAmount} onChange={(v) => set("allowCustomAmount", v)} />

          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <Label>قيم خاصة حسب العملة (اختياري)</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  تظهر للزائر الذي اختار هذه العملة بدل القيم المحوَّلة، وتُضاف للسلة بها.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setRows((p) => [...p, { id: rowId(), currency: "EUR", amountsStr: "" }])} className="gap-1">
                <Plus className="w-4 h-4" />
                إضافة عملة
              </Button>
            </div>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">بدون استثناءات: القيم بالدولار تُحوَّل إلى كل العملات.</p>
            ) : (
              <div className="space-y-3">
                {rows.map((row) => (
                  <div key={row.id} className="flex flex-col sm:flex-row gap-2 sm:items-end border rounded-lg p-3">
                    <div className="flex-1 min-w-[140px]">
                      <Label className="text-xs text-muted-foreground">العملة</Label>
                      <Select value={row.currency} onValueChange={(v) => setRows((p) => p.map((r) => (r.id === row.id ? { ...r, currency: v } : r)))}>
                        <SelectTrigger className="mt-1" dir="ltr">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SUPPORTED_CURRENCY_OPTIONS.filter((c) => c.code !== "USD").map((c) => (
                            <SelectItem key={c.code} value={c.code}>
                              {c.code} — {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-[2]">
                      <Label className="text-xs text-muted-foreground">المبالغ لهذه العملة</Label>
                      <Input
                        className="mt-1 font-mono text-left"
                        dir="ltr"
                        value={row.amountsStr}
                        onChange={(e) => setRows((p) => p.map((r) => (r.id === row.id ? { ...r, amountsStr: e.target.value } : r)))}
                        placeholder="مثال: 50, 100, 200, 500"
                      />
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="shrink-0 text-destructive" onClick={() => setRows((p) => p.filter((r) => r.id !== row.id))} aria-label="حذف الصف">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Frequency ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>التكرار</CardTitle>
          <CardDescription>الخيارات الظاهرة على شريط التكرار، وأيها يكون محددًا عند فتح الصفحة</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="flex flex-wrap gap-2">
            {QUICK_FREQUENCIES.map((f) => (
              <CheckChip key={f} label={FREQ_LABEL[f]} checked={shownFrequencies.includes(f)} onChange={(v) => toggleFrequency(f, v)} />
            ))}
          </div>
          <div>
            <Label>الافتراضي</Label>
            <Select value={config.defaultFrequency} onValueChange={(v) => set("defaultFrequency", v as CartFreqKey)}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {shownFrequencies.map((f) => (
                  <SelectItem key={f} value={f}>
                    {FREQ_LABEL[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ── Destinations ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>الوجهات في القائمة</CardTitle>
          <CardDescription>ما يظهر في قائمة «المشروع أو النية»: النوايا العامة أولًا، ثم المشاريع</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label className="mb-2 block">النوايا العامة</Label>
            <div className="flex flex-wrap gap-2">
              {QUICK_GENERIC_DESTINATIONS.map((g) => (
                <CheckChip key={g} label={GENERIC_LABEL[g]} checked={shownGeneric.includes(g)} onChange={(v) => toggleGeneric(g, v)} />
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
            <div>
              <Label>المشاريع</Label>
              <Select value={config.projectsMode} onValueChange={(v) => set("projectsMode", v as QuickProjectsMode)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المشاريع النشطة</SelectItem>
                  <SelectItem value="selected">مشاريع محددة</SelectItem>
                  <SelectItem value="none">بدون مشاريع</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الوجهة الافتراضية</Label>
              <Select value={config.defaultDestination || "__first__"} onValueChange={(v) => set("defaultDestination", v === "__first__" ? "" : v)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__first__">أول خيار في القائمة</SelectItem>
                  {destinationOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.project ? `مشروع: ${o.label}` : o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {config.projectsMode === "selected" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label>
                  المشاريع المحددة <span className="text-muted-foreground font-normal">({config.projectIds.length})</span>
                </Label>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute top-1/2 -translate-y-1/2 end-2.5 w-3.5 h-3.5 text-slate-400" />
                  <Input value={projectQuery} onChange={(e) => setProjectQuery(e.target.value)} placeholder="بحث باسم المشروع…" className="pe-8" />
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-lg border divide-y">
                {campaignsLoading ? (
                  <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> جارٍ تحميل المشاريع…
                  </div>
                ) : filteredCampaigns.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">لا مشاريع مطابقة</div>
                ) : (
                  filteredCampaigns.map((c) => {
                    const on = config.projectIds.includes(c.id);
                    return (
                      <label key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                        <Checkbox checked={on} onCheckedChange={(v) => toggleProject(c.id, v === true)} />
                        <span className="flex-1 min-w-0 truncate">{c.title}</span>
                        {!c.isActive && <Badge variant="outline" className="text-[10px]">غير نشط</Badge>}
                      </label>
                    );
                  })
                )}
              </div>
              <p className="text-xs text-muted-foreground">تظهر المشاريع بالترتيب المعتاد للموقع. المشروع غير النشط لا يظهر للزائر وإن كان محددًا.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Title ───────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>العنوان</CardTitle>
          <CardDescription>اتركه فارغًا ليُستخدم النص الافتراضي للموقع بكل اللغات («التبرع السريع»)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="qd-title-ar">العنوان بالعربية</Label>
            <Input id="qd-title-ar" className="mt-1.5" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} placeholder="التبرع السريع" maxLength={80} />
          </div>
          <ContentTranslationTabs fields={TITLE_FIELDS} value={titles} onChange={setTitles} requiredField="title" />
        </CardContent>
      </Card>

      <div className="flex justify-end pb-6">
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? <Loader2 className="h-4 w-4 ms-2 animate-spin" /> : <Save className="h-4 w-4 ms-2" />}
          حفظ الإعدادات
        </Button>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground mt-0.5">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}

function CheckChip({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
        checked ? "bg-brand border-brand text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}
