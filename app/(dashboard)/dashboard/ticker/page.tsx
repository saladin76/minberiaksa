"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Info, Loader2, Plus, RefreshCw, Save, Ticket, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useToast } from "@/hooks/use-toast";
import { dt } from "@/lib/dashboard/i18n";

interface TickerConfig {
  id?: string;
  isActive: boolean;
  showRecentDonations: boolean;
  showRegisteredNames: boolean;
  donorNames: string[];
  amountRanges: AmountRange[];
  minIntervalSeconds: number;
  maxIntervalSeconds: number;
}

interface AmountRange {
  minAmount: number;
  maxAmount: number;
  probability: number;
  label: string;
}

const DEFAULT_CONFIG: TickerConfig = {
  isActive: true,
  showRecentDonations: true,
  showRegisteredNames: false,
  donorNames: [],
  amountRanges: [{ minAmount: 5, maxAmount: 50, probability: 100, label: "small" }],
  minIntervalSeconds: 3,
  maxIntervalSeconds: 8,
};

export default function TickerAdminPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<TickerConfig>(DEFAULT_CONFIG);
  const [donorNamesInput, setDonorNamesInput] = useState("");

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/live-donation-ticker?view=admin", { cache: "no-store" });
      if (response.status === 404) {
        setConfig(DEFAULT_CONFIG);
        setDonorNamesInput("");
        return;
      }
      if (!response.ok) throw new Error(dt("فشل في تحميل إعدادات شريط التبرعات"));

      const data = await response.json();
      setConfig({
        id: data.id,
        isActive: data.isActive === true,
        showRecentDonations: data.showRecentDonations !== false,
        showRegisteredNames: data.showRegisteredNames === true,
        donorNames: Array.isArray(data.donorNames) ? data.donorNames : [],
        amountRanges: Array.isArray(data.amountRanges) ? data.amountRanges : [],
        minIntervalSeconds: Number.isInteger(data.minIntervalSeconds) ? data.minIntervalSeconds : DEFAULT_CONFIG.minIntervalSeconds,
        maxIntervalSeconds: Number.isInteger(data.maxIntervalSeconds) ? data.maxIntervalSeconds : DEFAULT_CONFIG.maxIntervalSeconds,
      });
      setDonorNamesInput((Array.isArray(data.donorNames) ? data.donorNames : []).join("\n"));
    } catch (error) {
      toast({
        title: dt("تعذر تحميل الإعدادات"),
        description: error instanceof Error ? error.message : dt("حاول تحديث الصفحة"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const handleSave = async () => {
    const donorNames = donorNamesInput.split(/\r?\n/u).map((name) => name.trim()).filter(Boolean);
    const probabilityTotal = config.amountRanges.reduce((sum, range) => sum + range.probability, 0);
    const rangesAreValid = config.amountRanges.length > 0 && config.amountRanges.every((range) =>
      Number.isFinite(range.minAmount) && range.minAmount >= 0 &&
      Number.isFinite(range.maxAmount) && range.maxAmount >= range.minAmount &&
      Number.isFinite(range.probability) && range.probability >= 0 && range.probability <= 100,
    );
    const live = config.showRecentDonations || config.showRegisteredNames;
    if (!live && !donorNames.length) {
      toast({ title: dt("أدخل أسماء العرض"), description: dt("أضف اسمًا واحدًا على الأقل لاستخدامه في الشريط"), variant: "destructive" });
      return;
    }
    if (donorNames.length > 100 || donorNames.some((name) => name.length > 80)) {
      toast({ title: dt("راجع قائمة أسماء العرض"), description: dt("استخدم حتى 100 اسم، بحد أقصى 80 حرفًا للاسم الواحد"), variant: "destructive" });
      return;
    }
    if (!live && (!rangesAreValid || Math.abs(probabilityTotal - 100) > 0.01)) {
      toast({ title: dt("راجع اقتراحات المبالغ"), description: dt("تأكد من صحة النطاقات وأن مجموع احتمالاتها يساوي 100٪"), variant: "destructive" });
      return;
    }
    if (
      !Number.isInteger(config.minIntervalSeconds) ||
      !Number.isInteger(config.maxIntervalSeconds) ||
      config.minIntervalSeconds < 3 ||
      config.maxIntervalSeconds < config.minIntervalSeconds ||
      config.maxIntervalSeconds > 3600
    ) {
      toast({
        title: dt("راجع توقيت العرض"),
        description: dt("أدخل أعدادًا صحيحة بين 3 و3600 ثانية، واجعل الحد الأدنى أقل من الحد الأقصى"),
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/live-donation-ticker", {
        method: config.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(config.id ? { id: config.id } : {}),
          isActive: config.isActive,
          showRecentDonations: config.showRecentDonations,
          showRegisteredNames: config.showRegisteredNames,
          donorNames,
          amountRanges: config.amountRanges,
          minIntervalSeconds: config.minIntervalSeconds,
          maxIntervalSeconds: config.maxIntervalSeconds,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || dt("فشل في حفظ الإعدادات"));

      setConfig({
        id: result.id ?? config.id,
        isActive: result.isActive === true,
        showRecentDonations: result.showRecentDonations === true,
        showRegisteredNames: result.showRegisteredNames === true,
        donorNames: result.donorNames ?? donorNames,
        amountRanges: result.amountRanges ?? config.amountRanges,
        minIntervalSeconds: result.minIntervalSeconds,
        maxIntervalSeconds: result.maxIntervalSeconds,
      });
      toast({ title: dt("تم الحفظ"), description: dt("تم تحديث إعدادات شريط التبرعات") });
    } catch (error) {
      toast({
        title: dt("تعذر حفظ الإعدادات"),
        description: error instanceof Error ? error.message : dt("حاول مرة أخرى"),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const addAmountRange = () => setConfig((current) => ({
    ...current,
    amountRanges: [...current.amountRanges, { minAmount: 10, maxAmount: 50, probability: 0, label: "" }],
  }));

  const updateAmountRange = (index: number, field: keyof AmountRange, value: number | string) => {
    setConfig((current) => ({
      ...current,
      amountRanges: current.amountRanges.map((range, i) => i === index ? { ...range, [field]: value } : range),
    }));
  };

  const removeAmountRange = (index: number) => setConfig((current) => ({
    ...current,
    amountRanges: current.amountRanges.filter((_, i) => i !== index),
  }));

  if (loading) {
    return <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" aria-label={dt("جارٍ التحميل")} /></div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={dt("شريط التبرعات")}
        description={dt("اعرض التبرعات الفعلية وأسماء مجتمع الداعمين مع إخفاء الأسماء وتحديد توقيت الإشعارات")}
        icon={Ticket}
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void fetchConfig()} disabled={loading || saving}>
              <RefreshCw className="ms-2 h-4 w-4" />{dt("تحديث")}
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 className="ms-2 h-4 w-4 animate-spin" /> : <Save className="ms-2 h-4 w-4" />}
              {dt("حفظ الإعدادات")}
            </Button>
          </div>
        )}
      />

      {config.isActive && !config.showRecentDonations && !config.showRegisteredNames && !donorNamesInput.split("\n").some((name) => name.trim()) ? (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {dt("الشريط مفعل لكن قائمة أسماء العرض فارغة. أضف أسماء العرض واحفظها ليظهر الشريط.")}
        </p>
      ) : null}
      <Card><CardHeader><CardTitle>{dt("مصدر أسماء التيكر")}</CardTitle><CardDescription>{dt("يُخفى الاسم على الخادم ليظهر أول وآخر حرف من الاسم الأول والأخير فقط. لا تُعرض بيانات الاتصال.")}</CardDescription></CardHeader><CardContent className="space-y-4"><label className="flex items-center justify-between gap-3"><span>{dt("عرض التبرعات المدفوعة خلال آخر 24 ساعة")}</span><Switch checked={config.showRecentDonations} onCheckedChange={value => setConfig(current => ({...current, showRecentDonations:value}))} /></label><label className="flex items-center justify-between gap-3"><span>{dt("عرض أسماء الحسابات المسجلة أيضًا")}</span><Switch checked={config.showRegisteredNames} onCheckedChange={value => setConfig(current => ({...current, showRegisteredNames:value}))} /></label><p className="text-xs leading-6 text-slate-500">{dt("أسماء الحسابات تظهر كأعضاء في مجتمع الداعمين، دون نسبة تبرع أو مبلغ غير حقيقي لهم.")}</p></CardContent></Card>
      <Card>
        <CardHeader>
          <CardTitle>{dt("حالة الشريط")}</CardTitle>
          <CardDescription>{dt("عند التفعيل، يعرض الموقع الإشعارات من المصادر المحددة أعلاه")}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-6">
          <div>
            <Label htmlFor="ticker-active" className="text-base">{config.isActive ? dt("الشريط مفعل") : dt("الشريط متوقف")}</Label>
            <p className="mt-1 text-sm text-muted-foreground">{dt("تظهر الأسماء مخفية، والتبرعات المعتمدة فقط تحمل مبلغًا وتوقيتًا فعليين.")}</p>
          </div>
          <Switch
            id="ticker-active"
            checked={config.isActive}
            onCheckedChange={(isActive) => setConfig((current) => ({ ...current, isActive }))}
          />
        </CardContent>
      </Card>

      {!config.showRecentDonations && !config.showRegisteredNames ? <>
      <Card>
        <CardHeader>
          <CardTitle>{dt("أسماء العرض الافتراضية")}</CardTitle>
          <CardDescription>{dt("اكتب اسمًا في كل سطر. هذه القائمة التي تختارها أنت، ولا ترتبط بسجلات المتبرعين أو حساباتهم")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            aria-label={dt("أسماء العرض الافتراضية")}
            placeholder={dt("اسم العرض الأول\nاسم العرض الثاني\nاسم العرض الثالث")}
            value={donorNamesInput}
            onChange={(event) => setDonorNamesInput(event.target.value)}
            rows={5}
            maxLength={8000}
          />
          <p className="text-sm text-muted-foreground">
            {dt("عدد الأسماء")}: {donorNamesInput.split(/\r?\n/u).map((name) => name.trim()).filter(Boolean).length} / 100
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{dt("اقتراحات المبالغ")}</CardTitle>
              <CardDescription>{dt("إعدادات توافق قديمة؛ لا تُعرض هذه الأرقام كتبرعات فعلية. استخدم مصدر التبرعات المدفوعة لعرض مبالغ حقيقية.")}</CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={addAmountRange}>
              <Plus className="ms-2 h-4 w-4" />{dt("إضافة نطاق")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {config.amountRanges.map((range, index) => (
            <div key={index} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.5fr_auto]">
              <div className="space-y-2">
                <Label htmlFor={`ticker-range-min-${index}`}>{dt("من (USD)")}</Label>
                <Input id={`ticker-range-min-${index}`} type="number" min={0} step="any" value={range.minAmount}
                  onChange={(event) => updateAmountRange(index, "minAmount", Number(event.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`ticker-range-max-${index}`}>{dt("إلى (USD)")}</Label>
                <Input id={`ticker-range-max-${index}`} type="number" min={0} step="any" value={range.maxAmount}
                  onChange={(event) => updateAmountRange(index, "maxAmount", Number(event.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`ticker-range-weight-${index}`}>{dt("النسبة المئوية")}</Label>
                <Input id={`ticker-range-weight-${index}`} type="number" min={0} max={100} step="any" value={range.probability}
                  onChange={(event) => updateAmountRange(index, "probability", Number(event.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`ticker-range-label-${index}`}>{dt("وصف اختياري")}</Label>
                <Input id={`ticker-range-label-${index}`} maxLength={60} value={range.label}
                  onChange={(event) => updateAmountRange(index, "label", event.target.value)} />
              </div>
              <Button type="button" variant="outline" size="icon" className="self-end text-destructive" aria-label={dt("حذف النطاق")}
                onClick={() => removeAmountRange(index)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <p className={`text-sm ${Math.abs(config.amountRanges.reduce((sum, range) => sum + range.probability, 0) - 100) > 0.01 ? "text-destructive" : "text-muted-foreground"}`}>
            {dt("مجموع النسب")}: {config.amountRanges.reduce((sum, range) => sum + range.probability, 0)}%
          </p>
        </CardContent>
      </Card>

      </> : null}
      <Card>
        <CardHeader>
          <CardTitle>{dt("توقيت الإشعارات")}</CardTitle>
          <CardDescription>{dt("الفاصل الزمني بين إشعار وآخر. لا يغيّر هذا قيمة التبرع أو وقت اعتماده")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ticker-min-interval">{dt("الحد الأدنى للفاصل (ثوانٍ)")}</Label>
            <Input
              id="ticker-min-interval"
              type="number"
              min={3}
              max={3600}
              step={1}
              value={config.minIntervalSeconds}
              onChange={(event) => setConfig((current) => ({ ...current, minIntervalSeconds: Number(event.target.value) }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ticker-max-interval">{dt("الحد الأقصى للفاصل (ثوانٍ)")}</Label>
            <Input
              id="ticker-max-interval"
              type="number"
              min={3}
              max={3600}
              step={1}
              value={config.maxIntervalSeconds}
              onChange={(event) => setConfig((current) => ({ ...current, maxIntervalSeconds: Number(event.target.value) }))}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
        <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <p className="leading-6">{dt("التبرعات الفعلية مأخوذة من المدفوعات المعتمدة فقط. أسماء الحسابات المسجلة تظهر كدعم مجتمعي دون مبلغ. إعدادات العرض اليدوية لا تنشئ تبرعات.")}</p>
      </div>
    </div>
  );
}
