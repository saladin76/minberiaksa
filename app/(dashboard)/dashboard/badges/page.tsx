"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "react-hot-toast";
import { Award, Pencil, Trash2, Plus, Loader2, Users, RotateCw, Info, Languages, ListFilter } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import type { BadgeCriteriaType } from "@/lib/badge-criteria";
import { LOCALE_OPTIONS } from "@/lib/locales";
import { dashDir, dt, dtx } from "@/lib/dashboard/i18n";
import { useLocale } from "next-intl";
import { DonorListsManager } from "./_components/DonorListsManager";

const CRITERIA_TYPES: { value: BadgeCriteriaType; label: string }[] = [
  { value: "TOTAL_LAST_N_MONTHS", get label() { return dt("مجموع التبرعات خلال آخر عدد أشهر"); } },
  { value: "ANY_SPAN_N_MONTHS", get label() { return dt("مجموع خلال أي أشهر متتالية"); } },
  { value: "MONTHLY_ACTIVE_RANGE", get label() { return dt("إجمالي التزامات الاشتراك الشهري النشطة"); } },
  { value: "TOTAL_LIFETIME", get label() { return dt("إجمالي التبرعات"); } },
  { value: "DONATION_COUNT_MIN", get label() { return dt("عدد مرات التبرع"); } },
];

const CRITERIA_EXPLANATIONS: Record<BadgeCriteriaType, string> = {
  get TOTAL_LAST_N_MONTHS() { return dt("تضم المجموعة من وصل مجموع تبرعاته المحصّلة في المدة المتحركة حتى اليوم إلى الحد الذي تحدده."); },
  get ANY_SPAN_N_MONTHS() { return dt("تضم المجموعة من وصل مجموع تبرعاته المحصّلة في أي أشهر تقويمية متتالية إلى الحد الذي تحدده."); },
  get MONTHLY_ACTIVE_RANGE() { return dt("تضم المجموعة من يقع مجموع مبالغ خططه النشطة ذات الدورية الشهرية ضمن هذا النطاق، وليس مجموع ما دفعه تاريخيًا."); },
  get TOTAL_LIFETIME() { return dt("تضم المجموعة من تجاوز مجموع تبرعاته المؤكدة منذ البداية الحد المحدد."); },
  get DONATION_COUNT_MIN() { return dt("تضم المجموعة من أتم الحد الأدنى من عمليات التبرع المؤكدة، بصرف النظر عن قيمتها."); },
};

const LOCALES = LOCALE_OPTIONS;
const emptyTranslations = () => Object.fromEntries(LOCALES.map(({ code }) => [code, ""])) as Record<string, string>;

interface BadgeItem {
  id: string;
  name: string;
  color: string;
  criteria: Record<string, unknown>;
  order: number;
  createdAt: string;
  translatedName?: string;
  translationCount: number;
}

interface BadgeForm {
  name: string;
  color: string;
  criteria: {
    type: BadgeCriteriaType;
    amountMinUSD?: number;
    amountMaxUSD?: number;
    months?: number;
    count?: number;
  };
  translations: Record<string, string>;
}

const defaultCriteria = (): BadgeForm["criteria"] => ({
  type: "TOTAL_LIFETIME",
  amountMinUSD: 100,
});

function criteriaForType(type: BadgeCriteriaType): BadgeForm["criteria"] {
  if (type === "TOTAL_LAST_N_MONTHS" || type === "ANY_SPAN_N_MONTHS") return { type, amountMinUSD: 100, months: 1 };
  if (type === "MONTHLY_ACTIVE_RANGE") return { type, amountMinUSD: 0, amountMaxUSD: 1000 };
  if (type === "DONATION_COUNT_MIN") return { type, count: 1 };
  return { type, amountMinUSD: 100 };
}

function criteriaSummary(c: BadgeForm["criteria"]): string {
  switch (c.type) {
    case "TOTAL_LAST_N_MONTHS":
      return dt("آخر {0} شهر من اليوم، مبلغ {1} دولار أو أكثر", [c.months ?? 0, c.amountMinUSD ?? 0]);
    case "ANY_SPAN_N_MONTHS":
      return dt("أي {0} شهر متتالية، مبلغ {1} دولار أو أكثر", [c.months ?? 0, c.amountMinUSD ?? 0]);
    case "MONTHLY_ACTIVE_RANGE":
      return dt("إجمالي الاشتراكات الشهرية النشطة بين {0} و {1} دولار", [c.amountMinUSD ?? 0, c.amountMaxUSD ?? "—"]);
    case "TOTAL_LIFETIME":
      return dt("إجمالي التبرعات مدى الحياة {0} دولار أو أكثر", [c.amountMinUSD ?? 0]);
    case "DONATION_COUNT_MIN":
      return dt("عدد التبرعات {0} مرة أو أكثر", [c.count ?? 0]);
    default:
      return "";
  }
}

export default function BadgesPage() {
  const uiLocale = useLocale();
  const [activeTab, setActiveTab] = useState<"lists" | "criteria">("lists");
  const [badges, setBadges] = useState<BadgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BadgeForm>({
    name: "",
    color: "#35708f",
    criteria: defaultCriteria(),
    translations: emptyTranslations(),
  });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeTranslationLocale, setActiveTranslationLocale] = useState("en");
  const [audienceCounts, setAudienceCounts] = useState<Record<string, number>>({});
  const [audienceLoadingId, setAudienceLoadingId] = useState<string | null>(null);

  const loadBadges = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await axios.get(`/api/admin/badges?locale=${encodeURIComponent(uiLocale)}`);
      setBadges(res.data?.badges ?? []);
    } catch (err) {
      console.error(err);
      setLoadError(true);
      toast.error(dt("تعذّر تحميل شرائح التبرع"));
    } finally {
      setLoading(false);
    }
  }, [uiLocale]);

  useEffect(() => { void loadBadges(); }, [loadBadges]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      name: "",
      color: "#35708f",
      criteria: defaultCriteria(),
      translations: emptyTranslations(),
    });
    setActiveTranslationLocale("en");
    setDialogOpen(true);
  };

  const openEdit = async (badge: BadgeItem) => {
    setEditingId(badge.id);
    try {
      const res = await axios.get(`/api/admin/badges/${badge.id}`);
      const b = res.data;
      const translations = emptyTranslations();
      (b.translations ?? []).forEach((t: { locale: string; name: string }) => {
        translations[t.locale] = t.name ?? "";
      });
      setActiveTranslationLocale("en");
      setForm({
        name: b.name ?? "",
        color: b.color ?? "#35708f",
        criteria: {
          type: (b.criteria?.type as BadgeCriteriaType) ?? "TOTAL_LIFETIME",
          amountMinUSD: b.criteria?.amountMinUSD,
          amountMaxUSD: b.criteria?.amountMaxUSD,
          months: b.criteria?.months,
          count: b.criteria?.count,
        },
        translations,
      });
      setDialogOpen(true);
    } catch {
      toast.error(dt("تعذّر تحميل شريحة التبرع"));
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || form.name.trim().length > 80) {
      toast.error(dt("أدخل اسمًا من 1 إلى 80 حرفًا"));
      return;
    }
    if (!form.color.match(/^#[0-9a-f]{6}$/i)) {
      toast.error(dt("اختر لونًا بصيغة HEX صحيحة"));
      return;
    }
    const c = form.criteria;
    const validCriteria = c.type === "TOTAL_LIFETIME"
      ? Number.isFinite(c.amountMinUSD) && (c.amountMinUSD ?? 0) > 0
      : c.type === "TOTAL_LAST_N_MONTHS" || c.type === "ANY_SPAN_N_MONTHS"
        ? Number.isFinite(c.amountMinUSD) && (c.amountMinUSD ?? 0) > 0 && Number.isInteger(c.months) && (c.months ?? 0) >= 1 && (c.months ?? 0) <= 120
        : c.type === "MONTHLY_ACTIVE_RANGE"
          ? Number.isFinite(c.amountMinUSD) && Number.isFinite(c.amountMaxUSD) && (c.amountMinUSD ?? -1) >= 0 && (c.amountMaxUSD ?? -1) >= (c.amountMinUSD ?? 0)
          : Number.isInteger(c.count) && (c.count ?? 0) >= 1;
    if (!validCriteria) {
      toast.error(dt("أكمل قيم المعيار بقيم صحيحة قبل الحفظ"));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        color: form.color,
        criteria: {
          type: form.criteria.type,
          amountMinUSD: form.criteria.amountMinUSD,
          amountMaxUSD: form.criteria.amountMaxUSD,
          months: form.criteria.months,
          count: form.criteria.count,
        },
        translations: form.translations,
      };
      if (editingId) {
        await axios.put(`/api/admin/badges/${editingId}`, payload);
        toast.success(dt("تم تحديث شريحة التبرع"));
      } else {
        await axios.post("/api/admin/badges", payload);
        toast.success(dt("تم إنشاء شريحة التبرع"));
      }
      setDialogOpen(false);
      await loadBadges();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || dt("فشل في الحفظ"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(dt("حذف هذه المجموعة؟ ستختفي من اختيار الجمهور، وأي جمهور محفوظ يعتمد عليها لن يجد أعضاءً مطابقين."))) return;
    setDeletingId(id);
    try {
      await axios.delete(`/api/admin/badges/${id}`);
      toast.success(dt("تم حذف شريحة التبرع"));
      await loadBadges();
    } catch {
      toast.error(dt("فشل في الحذف"));
    } finally {
      setDeletingId(null);
    }
  };

  const loadAudienceCount = async (id: string) => {
    setAudienceLoadingId(id);
    try {
      const res = await axios.get(`/api/admin/badges/${id}/users?countOnly=true`);
      setAudienceCounts((current) => ({ ...current, [id]: Number(res.data?.count) || 0 }));
    } catch {
      toast.error(dt("تعذر حساب عدد المتبرعين المطابقين"));
    } finally {
      setAudienceLoadingId(null);
    }
  };

  return (
    <div className="min-h-0" dir={dashDir()}>
      <div className="mx-auto max-w-[1200px] space-y-5">
        <PageHeader
          title={dt("تصنيفات المتبرعين")}
          description={dt("أنشئ قوائم اتصال يدويًا أو عبر ملف، أو أنشئ شرائح ديناميكية اعتمادًا على سجل التبرعات.")}
          icon={Award}
          actions={activeTab === "criteria" ? (
            <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" />{dt("شريحة تبرع جديدة")}</Button>
          ) : undefined}
        />
        <div role="tablist" aria-label={dt("أنواع تصنيفات المتبرعين")} className="flex flex-wrap gap-2 border-b pb-3">
          <button type="button" role="tab" aria-selected={activeTab === "lists"} onClick={() => setActiveTab("lists")} className={"rounded-lg px-4 py-2 text-sm font-semibold transition-colors " + (activeTab === "lists" ? "bg-brand text-white" : "border bg-white text-slate-600 hover:bg-slate-50")}>
            <Users className="me-2 inline h-4 w-4" />{dt("قوائم المتبرعين")}
          </button>
          <button type="button" role="tab" aria-selected={activeTab === "criteria"} onClick={() => setActiveTab("criteria")} className={"rounded-lg px-4 py-2 text-sm font-semibold transition-colors " + (activeTab === "criteria" ? "bg-brand text-white" : "border bg-white text-slate-600 hover:bg-slate-50")}>
            <ListFilter className="me-2 inline h-4 w-4" />{dt("شرائح التبرع")}
          </button>
        </div>
        {activeTab === "lists" ? <DonorListsManager /> : (
        <>
        <div className="space-y-6">

        <Card className="border-sky-200 bg-sky-50/60 dark:border-sky-900 dark:bg-sky-950/20">
          <CardContent className="flex items-start gap-3 p-4 text-sm leading-6">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" aria-hidden="true" />
            <p>{dt("هذه شرائح تعتمد على قواعد التبرع لاستخدامها في فلاتر الجمهور والحملات. لا تظهر للزائر ولا ترسل رسائل تلقائيًا، والتبرعات غير المؤكدة لا تدخل في الحساب.")}</p>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : loadError ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">{dt("تعذر تحميل مجموعات المتبرعين")}</p>
              <Button variant="outline" onClick={() => void loadBadges()}><RotateCw className="ms-2 h-4 w-4" />{dt("إعادة المحاولة")}</Button>
            </CardContent>
          </Card>
        ) : badges.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {dt("لا توجد مجموعات بعد. أنشئ أول مجموعة لتقسيم الجمهور حسب معايير واضحة.")}</CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {badges.map((badge) => (
              <Card key={badge.id} className="border-border">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-10 h-10 rounded-lg shrink-0 border border-border"
                      style={{ backgroundColor: badge.color }}
                    />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground">
                        {badge.translatedName || badge.name}
                        </p>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          <Languages className="me-1 inline h-3 w-3" aria-hidden="true" />
                          {dt("ترجمات")}: {badge.translationCount} / {LOCALES.length}
                        </span>
                      </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                        {criteriaSummary(badge.criteria as BadgeForm["criteria"])}
                      </p>
                      {audienceCounts[badge.id] !== undefined && <p className="mt-1 text-xs font-medium text-sky-700">{dtx("عدد المتبرعين المطابقين: {0}", [audienceCounts[badge.id]])}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => void loadAudienceCount(badge.id)} disabled={audienceLoadingId === badge.id} className="gap-1">
                      {audienceLoadingId === badge.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Users className="h-3 w-3" />}
                      {audienceCounts[badge.id] === undefined ? dt("حجم المجموعة") : dt("تحديث العدد")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(badge)}
                      className="gap-1"
                    >
                      <Pencil className="w-3 h-3" />
                      {dt("تعديل")}</Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(badge.id)}
                      disabled={deletingId === badge.id}
                      className="gap-1 text-destructive hover:text-destructive"
                    >
                      {deletingId === badge.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                      {dt("حذف")}</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        </div>
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!saving) setDialogOpen(open); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir={dashDir()}>
          <DialogHeader>
          <DialogTitle>{editingId ? dt("تعديل مجموعة المتبرعين") : dt("مجموعة متبرعين جديدة")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="badge-name">{dt("اسم المجموعة الافتراضي")}</Label>
              <Input
                id="badge-name"
                maxLength={80}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={dt("مثال: متبرعون بإجمالي مؤكد 1000 USD أو أكثر")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="badge-color">{dt("اللون")}</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="w-12 h-10 rounded border cursor-pointer"
                />
                <Input
                  id="badge-color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{dt("نوع المعيار")}</Label>
              <Select
                value={form.criteria.type}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    criteria: criteriaForType(v as BadgeCriteriaType),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRITERIA_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="block text-sm text-muted-foreground pt-1">
                {CRITERIA_EXPLANATIONS[form.criteria.type]}
              </span>
            </div>
            {(form.criteria.type === "TOTAL_LAST_N_MONTHS" ||
              form.criteria.type === "ANY_SPAN_N_MONTHS") && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="badge-amount-min">{dt("الحد الأدنى للمبلغ (USD)")}</Label>
                  <Input
                    id="badge-amount-min"
                    type="number"
                    min={0.01}
                    step="any"
                    value={form.criteria.amountMinUSD ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        criteria: {
                          ...f.criteria,
                          amountMinUSD: e.target.value ? Number(e.target.value) : undefined,
                        },
                      }))
                    }
                    placeholder="1000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="badge-months">{dt("عدد الأشهر")}</Label>
                  <Input
                    id="badge-months"
                    type="number"
                    min={1}
                    max={120}
                    step={1}
                    value={form.criteria.months ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        criteria: {
                          ...f.criteria,
                          months: e.target.value ? Number(e.target.value) : undefined,
                        },
                      }))
                    }
                    placeholder="2"
                  />
                </div>
              </>
            )}
            {form.criteria.type === "MONTHLY_ACTIVE_RANGE" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="badge-monthly-amount-min">{dt("الحد الأدنى للإجمالي الشهري (USD)")}</Label>
                  <Input
                    id="badge-monthly-amount-min"
                    type="number"
                    min={0}
                    step="any"
                    value={form.criteria.amountMinUSD ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        criteria: {
                          ...f.criteria,
                          amountMinUSD: e.target.value ? Number(e.target.value) : undefined,
                        },
                      }))
                    }
                    placeholder="500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="badge-monthly-amount-max">{dt("الحد الأقصى للإجمالي الشهري (USD)")}</Label>
                  <Input
                    id="badge-monthly-amount-max"
                    type="number"
                    min={0}
                    step="any"
                    value={form.criteria.amountMaxUSD ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        criteria: {
                          ...f.criteria,
                          amountMaxUSD: e.target.value ? Number(e.target.value) : undefined,
                        },
                      }))
                    }
                    placeholder="800"
                  />
                </div>
              </>
            )}
            {form.criteria.type === "TOTAL_LIFETIME" && (
              <div className="space-y-2">
                <Label htmlFor="badge-lifetime-amount-min">{dt("الحد الأدنى للمبلغ (USD)")}</Label>
                <Input
                  id="badge-lifetime-amount-min"
                  type="number"
                  min={0.01}
                  step="any"
                  value={form.criteria.amountMinUSD ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      criteria: {
                        ...f.criteria,
                        amountMinUSD: e.target.value ? Number(e.target.value) : undefined,
                      },
                    }))
                  }
                  placeholder="1000"
                />
              </div>
            )}
            {form.criteria.type === "DONATION_COUNT_MIN" && (
              <div className="space-y-2">
                <Label htmlFor="badge-donation-count">{dt("الحد الأدنى لعدد التبرعات")}</Label>
                <Input
                  id="badge-donation-count"
                  type="number"
                  min={1}
                  step={1}
                  value={form.criteria.count ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      criteria: {
                        ...f.criteria,
                        count: e.target.value ? Number(e.target.value) : undefined,
                      },
                    }))
                  }
                  placeholder="10"
                />
              </div>
            )}

            <div className="border-t pt-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label className="block">{dt("اسم المجموعة حسب اللغة")}</Label>
                  <p className="mt-1 text-xs text-muted-foreground">{dtx("أدخل الترجمات التي راجعتها. الاسم الافتراضي يستخدم عند ترك لغة فارغة. {0} من {1} لغة مكتملة", [LOCALES.filter(({ code }) => Boolean(form.translations[code]?.trim())).length, LOCALES.length])}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="badge-translation-locale">{dt("اللغة")}</Label>
                <Select value={activeTranslationLocale} onValueChange={setActiveTranslationLocale}>
                  <SelectTrigger id="badge-translation-locale"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LOCALES.map((loc) => (
                      <SelectItem key={loc.code} value={loc.code}>
                        {loc.label}{form.translations[loc.code]?.trim() ? " · ✓" : " · —"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={form.translations[activeTranslationLocale] ?? ""}
                  maxLength={80}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    translations: { ...current.translations, [activeTranslationLocale]: event.target.value },
                  }))}
                  placeholder={form.name || dt("اكتب اسم المجموعة باللغة المختارة")}
                  aria-label={dt("اسم المجموعة المترجم")}
                />
                <p className="text-xs text-muted-foreground">{dt("يمكنك مراجعة جميع اللغات من القائمة. تحفظ التغييرات مع زر الحفظ نفسه.")}</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              {dt("إلغاء")}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editingId ? dt("حفظ التغييرات") : dt("إنشاء")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </>
        )}
    </div>
    </div>
  );
}
