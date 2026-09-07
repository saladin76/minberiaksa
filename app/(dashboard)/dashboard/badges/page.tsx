"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Award, Pencil, Trash2, Plus, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { cn } from "@/lib/utils";
import type { BadgeCriteriaType } from "@/lib/badge-criteria";
import { LOCALE_OPTIONS } from "@/lib/locales";

const CRITERIA_TYPES: { value: BadgeCriteriaType; label: string }[] = [
  { value: "TOTAL_LAST_N_MONTHS", label: "مجموع التبرع في آخر فترة" },
  { value: "ANY_SPAN_N_MONTHS", label: "أي فترة متتالية" },
  { value: "MONTHLY_ACTIVE_RANGE", label: "اشتراك شهري نشط" },
  { value: "TOTAL_LIFETIME", label: "إجمالي التبرعات" },
  { value: "DONATION_COUNT_MIN", label: "عدد مرات التبرع" },
];

const CRITERIA_EXPLANATIONS: Record<BadgeCriteriaType, string> = {
  TOTAL_LAST_N_MONTHS:
    "يُمنح الشارة لمن بلغ مجموع تبرعاته في آخر عدد من الأشهر (من اليوم للوراء) مبلغاً تحددّه أنت.",
  ANY_SPAN_N_MONTHS:
    "يُمنح الشارة لمن وُجدت في سجله فترة متتالية من أشهر (أي وقت) بلغ فيها مجموع تبرعاته مبلغاً تحددّه.",
  MONTHLY_ACTIVE_RANGE:
    "يُمنح الشارة لمن لديه اشتراك شهري مستمر حالياً وقيمة اشتراكه الشهري بين مبلغين تحددّهما (من وإلى).",
  TOTAL_LIFETIME:
    "يُمنح الشارة لمن بلغ إجمالي كل ما تبرع به منذ تسجيله مبلغاً تحددّه.",
  DONATION_COUNT_MIN:
    "يُمنح الشارة لمن بلغ عدد مرات تبرعه (بغض النظر عن المبلغ) عددا تحددّه.",
};

const LOCALES = LOCALE_OPTIONS;

interface BadgeItem {
  id: string;
  name: string;
  color: string;
  criteria: Record<string, unknown>;
  order: number;
  createdAt: string;
  translatedName?: string;
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

function criteriaSummary(c: BadgeForm["criteria"]): string {
  switch (c.type) {
    case "TOTAL_LAST_N_MONTHS":
      return `آخر ${c.months ?? 0} شهر من اليوم، مبلغ ${c.amountMinUSD ?? 0} دولار أو أكثر`;
    case "ANY_SPAN_N_MONTHS":
      return `أي ${c.months ?? 0} شهر متتالية، مبلغ ${c.amountMinUSD ?? 0} دولار أو أكثر`;
    case "MONTHLY_ACTIVE_RANGE":
      return `اشتراك شهري نشط بين ${c.amountMinUSD ?? 0} و ${c.amountMaxUSD ?? "—"} دولار`;
    case "TOTAL_LIFETIME":
      return `إجمالي التبرعات مدى الحياة ${c.amountMinUSD ?? 0} دولار أو أكثر`;
    case "DONATION_COUNT_MIN":
      return `عدد التبرعات ${c.count ?? 0} مرة أو أكثر`;
    default:
      return "";
  }
}

export default function BadgesPage() {
  const [badges, setBadges] = useState<BadgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BadgeForm>({
    name: "",
    color: "#3b82f6",
    criteria: defaultCriteria(),
    translations: { ar: "", en: "", fr: "", tr: "", id: "", pt: "", es: "" },
  });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadBadges = async () => {
    try {
      const res = await axios.get("/api/admin/badges?locale=ar");
      setBadges(res.data?.badges ?? []);
    } catch (err) {
      console.error(err);
      toast.error("فشل في تحميل الشارات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBadges();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      name: "",
      color: "#3b82f6",
      criteria: defaultCriteria(),
      translations: { ar: "", en: "", fr: "", tr: "", id: "", pt: "", es: "" },
    });
    setDialogOpen(true);
  };

  const openEdit = async (badge: BadgeItem) => {
    setEditingId(badge.id);
    try {
      const res = await axios.get(`/api/admin/badges/${badge.id}`);
      const b = res.data;
      const translations: Record<string, string> = { ar: "", en: "", fr: "", tr: "", id: "", pt: "", es: "" };
      (b.translations ?? []).forEach((t: { locale: string; name: string }) => {
        translations[t.locale] = t.name ?? "";
      });
      setForm({
        name: b.name ?? "",
        color: b.color ?? "#3b82f6",
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
    } catch (err) {
      toast.error("فشل في تحميل الشارة");
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("الاسم مطلوب");
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
        toast.success("تم تحديث الشارة");
      } else {
        await axios.post("/api/admin/badges", payload);
        toast.success("تم إنشاء الشارة");
      }
      setDialogOpen(false);
      loadBadges();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || "فشل في الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("حذف هذه الشارة؟")) return;
    setDeletingId(id);
    try {
      await axios.delete(`/api/admin/badges/${id}`);
      toast.success("تم حذف الشارة");
      loadBadges();
    } catch (err) {
      toast.error("فشل في الحذف");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-0" dir="rtl">
      <div className="space-y-6 max-w-[1200px] mx-auto">
        <PageHeader
          title="الشارات (مجموعات المستخدمين)"
          description="إنشاء وتعديل شارات حسب معايير التبرع (مبلغ، فترة، عدد)"
          icon={Award}
          actions={
            <Button onClick={openCreate} className="gap-2">
              <Plus className="w-4 h-4" />
              شارة جديدة
            </Button>
          }
        />

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : badges.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              لا توجد شارات. انقر &quot;شارة جديدة&quot; لإنشاء أول شارة.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {badges.map((badge) => (
              <Card key={badge.id} className="border-border">
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-10 h-10 rounded-lg shrink-0 border border-border"
                      style={{ backgroundColor: badge.color }}
                    />
                    <div>
                      <p className="font-semibold text-foreground">
                        {badge.translatedName || badge.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {criteriaSummary(badge.criteria as BadgeForm["criteria"])}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(badge)}
                      className="gap-1"
                    >
                      <Pencil className="w-3 h-3" />
                      تعديل
                    </Button>
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
                      حذف
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingId ? "تعديل الشارة" : "شارة جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>الاسم (افتراضي)</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="مثال: متبرعو ألف دولار"
              />
            </div>
            <div className="space-y-2">
              <Label>اللون</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="w-12 h-10 rounded border cursor-pointer"
                />
                <Input
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>نوع المعيار</Label>
              <Select
                value={form.criteria.type}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    criteria: { ...defaultCriteria(), type: v as BadgeCriteriaType },
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
                  <Label>الحد الأدنى للمبلغ (USD)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
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
                  <Label>عدد الأشهر</Label>
                  <Input
                    type="number"
                    min={1}
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
                  <Label>الحد الأدنى للمبلغ (USD)</Label>
                  <Input
                    type="number"
                    min={0}
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
                  <Label>الحد الأقصى للمبلغ (USD)</Label>
                  <Input
                    type="number"
                    min={0}
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
                <Label>الحد الأدنى للمبلغ (USD)</Label>
                <Input
                  type="number"
                  min={0}
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
                <Label>الحد الأدنى لعدد التبرعات</Label>
                <Input
                  type="number"
                  min={0}
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
              <Label className="mb-2 block">الترجمات (اختياري)</Label>
              <div className="space-y-2">
                {LOCALES.map((loc) => (
                  <div key={loc.code} className="flex items-center gap-2">
                    <span className="w-16 text-sm text-muted-foreground">{loc.label}</span>
                    <Input
                      value={form.translations[loc.code] ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          translations: {
                            ...f.translations,
                            [loc.code]: e.target.value,
                          },
                        }))
                      }
                      placeholder={form.name || `الاسم بـ ${loc.label}`}
                      className="flex-1"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editingId ? "حفظ التغييرات" : "إنشاء"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
