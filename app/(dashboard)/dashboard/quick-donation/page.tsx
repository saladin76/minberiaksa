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
import { dashDir, dt, dtx } from "@/lib/dashboard/i18n";

/**
 * The homepage quick-donation card and its dock, end to end: whether it shows,
 * the presets (USD, with per-currency overrides the way the campaign form
 * offers them), which one is suggested, the free field, the frequencies, the
 * destinations in the select, and the title per language.
 *
 * One document, one Save. The form keeps the config in the shape the API
 * stores, except for two things the admin types as text  the preset lists 
 * which are parsed on save the way the campaign form parses them.
 */

const FREQ_LABEL: Record<CartFreqKey, string> = {
  get once() { return dt("تبرع لمرة"); },
  get daily() { return dt("يوميًا"); },
  get friday() { return dt("أسبوعياً"); },
  get monthly() { return dt("شهريًا"); },
};

const GENERIC_LABEL: Record<QuickGenericDestination, string> = {
  get "where-needed"() { return dt("حيث الحاجة أشد"); },
  get zakat() { return dt("الزكاة"); },
  get waqf() { return dt("الوقف"); },
  get "gaza-relief"() { return dt("إغاثة غزة"); },
};

const TITLE_FIELDS = [{ name: "title", get label() { return dt("عنوان البطاقة"); } }] as const;

type CurrencyRow = { id: string; currency: string; amountsStr: string };
const rowId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type CampaignOption = { id: string; title: string; isActive: boolean };

/** Every campaign, active or not  an admin may pre-list one about to launch. */
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
      toast({ title: dt("خطأ"), description: errorMessage(e, dt("تعذّر تحميل الإعدادات")), variant: "destructive" });
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
    if (!on && shownFrequencies.length <= 1 && shownFrequencies.includes(f)) {
      toast({ title: dt("التكرار"), description: dt("يجب إظهار تكرار واحد على الأقل"), variant: "destructive" });
      return;
    }
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
      return toast({ title: dt("المبالغ"), description: dt("أدخل {0} مبالغ على الأقل", [QUICK_MIN_AMOUNTS]), variant: "destructive" });
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
      toast({ title: dt("تم الحفظ"), description: dt("تُطبَّق الإعدادات على الصفحة الرئيسية فورًا") });
    } catch (e) {
      toast({ title: dt("لم يُحفظ"), description: errorMessage(e, dt("تعذّر حفظ الإعدادات")), variant: "destructive" });
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
    <div className="max-w-5xl mx-auto space-y-6" dir={dashDir()}>
      <PageHeader
        title={dt("التبرع السريع")}
        description={dt("بطاقة التبرع السريع في الصفحة الرئيسية والشريط الذي يتبعها  المبالغ، التكرار، الوجهات، والعنوان")}
        icon={HeartHandshake}
        actions={
          <>
            <Button variant="outline" asChild>
              <a href="/ar#quick" target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 ms-2" />
                {dt("عرض في الموقع")}</a>
            </Button>
            <Button variant="outline" onClick={load} disabled={saving}>
              <RefreshCw className="h-4 w-4 ms-2" />
              {dt("تحديث")}</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 ms-2 animate-spin" /> : <Save className="h-4 w-4 ms-2" />}
              {dt("حفظ الإعدادات")}</Button>
          </>
        }
      />

      <Card className="border-brand-200 bg-gradient-to-br from-brand-50/80 to-white">
        <CardHeader>
          <CardTitle className="text-base">{dt("معاينة مباشرة")}</CardTitle>
          <CardDescription>{dt("شكل تقريبي للبطاقة حسب الإعدادات الحالية؛ المعاينة لا تنفّذ دفعًا.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">{dt("مؤسسة منبر الأقصى الدولية")}</p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">{titleAr.trim() || dt("التبرع السريع")}</h2>
              </div>
              <Badge variant={config.enabled ? "default" : "secondary"}>{config.enabled ? dt("مفعّلة") : dt("متوقفة")}</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {amounts.slice(0, 5).map((amount, index) => (
                <span key={index} className={"rounded-lg border px-4 py-2 text-sm font-bold tabular-nums " + (index === suggestedIndex ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-700")}>
                  {"$" + amount}
                  {index === suggestedIndex && <span className="ms-1 text-[10px] font-medium">{dt("مقترح")}</span>}
                </span>
              ))}
              {amounts.length === 0 && <span className="text-sm text-rose-700">{dt("أدخل المبالغ لعرضها هنا")}</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {shownFrequencies.map((frequency) => (
                <span key={frequency} className={"rounded-full px-3 py-1 text-xs " + (frequency === config.defaultFrequency ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600")}>{FREQ_LABEL[frequency]}</span>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
              <div>
                <p className="text-[11px] text-slate-500">{dt("الوجهة الافتراضية")}</p>
                <p className="text-sm font-semibold">{destinationOptions.find((option) => option.id === config.defaultDestination)?.label ?? destinationOptions[0]?.label ?? dt("اختر مشروعًا أو نية")}</p>
              </div>
              <span className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white">{dt("تبرع الآن")}</span>
            </div>
            {config.dockMobile || config.dockDesktop ? <p className="mt-3 text-center text-[11px] text-slate-500">{dt("يظهر شريط تبرع سريع أسفل الشاشة حسب خيارات الجهاز.")}</p> : null}
          </div>
        </CardContent>
      </Card>

      {/* ── Where it shows ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{dt("الظهور")}</CardTitle>
          <CardDescription>{dt("البطاقة في الصفحة، والشريط الذي يظهر أسفل الشاشة بعد تجاوزها")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <ToggleRow label={dt("إظهار البطاقة")} hint={dt("إيقافها يخفي البطاقة والشريط معًا")} checked={config.enabled} onChange={(v) => set("enabled", v)} />
          <ToggleRow label={dt("الشريط على الحاسوب")} hint={dt("شريط عائم أسفل الشاشة")} checked={config.dockDesktop} onChange={(v) => set("dockDesktop", v)} disabled={!config.enabled} />
          <ToggleRow label={dt("الشريط على الجوال")} hint={dt("شريط ثابت أسفل الشاشة")} checked={config.dockMobile} onChange={(v) => set("dockMobile", v)} disabled={!config.enabled} />
        </CardContent>
      </Card>

      {/* ── Amounts ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{dt("المبالغ المقترحة")}</CardTitle>
          <CardDescription>
            {dtx("من {0} إلى {1} مبالغ بالدولار. تُحوَّل تلقائيًا لعملة الزائر ما لم تضف قيمًا خاصة بعملته أدناه.", [QUICK_MIN_AMOUNTS, QUICK_MAX_AMOUNTS])}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <Label htmlFor="qd-amounts">{dt("المبالغ (USD)")}</Label>
              <Input
                id="qd-amounts"
                className="mt-1.5 font-mono text-left"
                dir="ltr"
                value={amountsStr}
                onChange={(e) => setAmountsStr(e.target.value)}
                placeholder="100, 300, 500, 700"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                {dtx("أرقام مفصولة بفاصلة أو مسافة · {0} من {1}", [amounts.length, QUICK_MAX_AMOUNTS])}
                {amounts.length < QUICK_MIN_AMOUNTS ? dt("  أضف المزيد") : ""}
              </p>
            </div>
            <div>
              <Label>{dt("المبلغ المقترح")}</Label>
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
              <p className="text-xs text-muted-foreground mt-1.5">{dt("يُعلَّم «مبلغ مقترح» ويكون محددًا مسبقًا")}</p>
            </div>
          </div>

          <ToggleRow label={dt("حقل «مبلغ آخر»")} hint={dt("يسمح للزائر بكتابة مبلغ حر")} checked={config.allowCustomAmount} onChange={(v) => set("allowCustomAmount", v)} />

          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <Label>{dt("قيم خاصة حسب العملة (اختياري)")}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {dt("تظهر للزائر الذي اختار هذه العملة بدل القيم المحوَّلة، وتُضاف للسلة بها.")}</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setRows((p) => [...p, { id: rowId(), currency: "EUR", amountsStr: "" }])} className="gap-1">
                <Plus className="w-4 h-4" />
                {dt("إضافة عملة")}</Button>
            </div>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{dt("بدون استثناءات: القيم بالدولار تُحوَّل إلى كل العملات.")}</p>
            ) : (
              <div className="space-y-3">
                {rows.map((row) => (
                  <div key={row.id} className="flex flex-col sm:flex-row gap-2 sm:items-end border rounded-lg p-3">
                    <div className="flex-1 min-w-[140px]">
                      <Label className="text-xs text-muted-foreground">{dt("العملة")}</Label>
                      <Select value={row.currency} onValueChange={(v) => setRows((p) => p.map((r) => (r.id === row.id ? { ...r, currency: v } : r)))}>
                        <SelectTrigger className="mt-1" dir="ltr">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SUPPORTED_CURRENCY_OPTIONS.filter((c) => c.code !== "USD").map((c) => (
                            <SelectItem key={c.code} value={c.code}>
                              {c.code}  {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-[2]">
                      <Label className="text-xs text-muted-foreground">{dt("المبالغ لهذه العملة")}</Label>
                      <Input
                        className="mt-1 font-mono text-left"
                        dir="ltr"
                        value={row.amountsStr}
                        onChange={(e) => setRows((p) => p.map((r) => (r.id === row.id ? { ...r, amountsStr: e.target.value } : r)))}
                        placeholder={dt("مثال: 50, 100, 200, 500")}
                      />
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="shrink-0 text-destructive" onClick={() => setRows((p) => p.filter((r) => r.id !== row.id))} aria-label={dt("حذف الصف")}>
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
          <CardTitle>{dt("التكرار")}</CardTitle>
          <CardDescription>{dt("الخيارات الظاهرة على شريط التكرار، وأيها يكون محددًا عند فتح الصفحة")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="flex flex-wrap gap-2">
            {QUICK_FREQUENCIES.map((f) => (
              <CheckChip key={f} label={FREQ_LABEL[f]} checked={shownFrequencies.includes(f)} onChange={(v) => toggleFrequency(f, v)} />
            ))}
          </div>
          <div>
            <Label>{dt("الافتراضي")}</Label>
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
          <CardTitle>{dt("الوجهات في القائمة")}</CardTitle>
          <CardDescription>{dt("ما يظهر في قائمة «المشروع أو النية»: النوايا العامة أولًا، ثم المشاريع")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label className="mb-2 block">{dt("النوايا العامة")}</Label>
            <div className="flex flex-wrap gap-2">
              {QUICK_GENERIC_DESTINATIONS.map((g) => (
                <CheckChip key={g} label={GENERIC_LABEL[g]} checked={shownGeneric.includes(g)} onChange={(v) => toggleGeneric(g, v)} />
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
            <div>
              <Label>{dt("المشاريع")}</Label>
              <Select value={config.projectsMode} onValueChange={(v) => set("projectsMode", v as QuickProjectsMode)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{dt("كل المشاريع النشطة")}</SelectItem>
                  <SelectItem value="selected">{dt("مشاريع محددة")}</SelectItem>
                  <SelectItem value="none">{dt("بدون مشاريع")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{dt("الوجهة الافتراضية")}</Label>
              <Select value={config.defaultDestination || "__first__"} onValueChange={(v) => set("defaultDestination", v === "__first__" ? "" : v)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__first__">{dt("أول خيار في القائمة")}</SelectItem>
                  {destinationOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.project ? dt("مشروع: {0}", [o.label]) : o.label}
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
                  {dt("المشاريع المحددة ")}<span className="text-muted-foreground font-normal">({config.projectIds.length})</span>
                </Label>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute top-1/2 -translate-y-1/2 end-2.5 w-3.5 h-3.5 text-slate-400" />
                  <Input value={projectQuery} onChange={(e) => setProjectQuery(e.target.value)} placeholder={dt("بحث باسم المشروع…")} className="pe-8" />
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-lg border divide-y">
                {campaignsLoading ? (
                  <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> {dt(" جارٍ تحميل المشاريع…")}</div>
                ) : filteredCampaigns.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">{dt("لا مشاريع مطابقة")}</div>
                ) : (
                  filteredCampaigns.map((c) => {
                    const on = config.projectIds.includes(c.id);
                    return (
                      <label key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                        <Checkbox checked={on} onCheckedChange={(v) => toggleProject(c.id, v === true)} />
                        <span className="flex-1 min-w-0 truncate">{c.title}</span>
                        {!c.isActive && <Badge variant="outline" className="text-[10px]">{dt("غير نشط")}</Badge>}
                      </label>
                    );
                  })
                )}
              </div>
              <p className="text-xs text-muted-foreground">{dt("تظهر المشاريع بالترتيب المعتاد للموقع. المشروع غير النشط لا يظهر للزائر وإن كان محددًا.")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Title ───────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{dt("العنوان")}</CardTitle>
          <CardDescription>{dt("اتركه فارغًا ليُستخدم النص الافتراضي للموقع بكل اللغات («التبرع السريع»)")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="qd-title-ar">{dt("العنوان بالعربية")}</Label>
            <Input id="qd-title-ar" className="mt-1.5" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} placeholder={dt("التبرع السريع")} maxLength={80} />
          </div>
          <ContentTranslationTabs fields={TITLE_FIELDS} value={titles} onChange={setTitles} requiredField="title" />
        </CardContent>
      </Card>

      <div className="flex justify-end pb-6">
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? <Loader2 className="h-4 w-4 ms-2 animate-spin" /> : <Save className="h-4 w-4 ms-2" />}
          {dt("حفظ الإعدادات")}</Button>
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
