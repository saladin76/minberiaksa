"use client";

import * as React from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, AlertCircle, Trash2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ALL_PLATFORM_REQUIREMENTS,
  getPlatformRequirements,
  type PlatformKey,
  type PlatformRequirements,
  type RequirementField,
} from "@/lib/marketing/platform-connection-requirements";
import {
  SUPPORTED_MARKETING_COUNTRIES,
  SUPPORTED_MARKETING_LOCALES,
  getCountryLabel,
  getLocaleLabel,
} from "@/lib/marketing/locales-countries";
import {
  PLATFORMS,
  PLATFORM_LABELS,
  PLATFORM_CATEGORY,
} from "./platform-meta";

interface ConnectionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: string | null;
  initialPlatform?: PlatformKey;
  onSaved: () => void;
}

interface ExistingConnection {
  id: string;
  platform: string;
  category: string;
  name: string;
  accountId: string | null;
  accountName: string | null;
  businessId: string | null;
  managerAccountId: string | null;
  pixelId: string | null;
  datasetId: string | null;
  conversionId: string | null;
  conversionLabel: string | null;
  advertiserId: string | null;
  appId: string | null;
  propertyId: string | null;
  streamId: string | null;
  messagingServiceSid: string | null;
  senderId: string | null;
  whatsappSender: string | null;
  smsSender: string | null;
  emailSender: string | null;
  enabled: boolean;
  defaultForPlatform: boolean;
  supportedLocales: string[];
  supportedCountries: string[];
  defaultCurrency: string | null;
  notes: string | null;
  accessTokenMasked: string | null;
  accessTokenPresent: boolean;
  refreshTokenMasked: string | null;
  refreshTokenPresent: boolean;
  authTokenMasked: string | null;
  authTokenPresent: boolean;
  appSecretMasked: string | null;
  appSecretPresent: boolean;
  clientSecretMasked: string | null;
  clientSecretPresent: boolean;
  developerTokenMasked: string | null;
  developerTokenPresent: boolean;
  apiSecretMasked: string | null;
  apiSecretPresent: boolean;
}

type FormState = Record<string, string>;

function pickFieldFromForm(form: FormState, field: string): string {
  const f = field.includes("|") ? field.split("|")[0] : field;
  return form[f] ?? "";
}

export function ConnectionDrawer({
  open,
  onOpenChange,
  editingId,
  initialPlatform,
  onSaved,
}: ConnectionDrawerProps) {
  const [platform, setPlatform] = React.useState<PlatformKey>(initialPlatform ?? "META");
  const [form, setForm] = React.useState<FormState>({});
  const [secretPresence, setSecretPresence] = React.useState<Record<string, boolean>>({});
  const [clearSecret, setClearSecret] = React.useState<Record<string, boolean>>({});
  const [locales, setLocales] = React.useState<string[]>(["ar"]);
  const [countries, setCountries] = React.useState<string[]>([]);
  const [enabled, setEnabled] = React.useState(true);
  const [defaultForPlatform, setDefaultForPlatform] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const reqs: PlatformRequirements = React.useMemo(
    () => getPlatformRequirements(platform),
    [platform]
  );

  React.useEffect(() => {
    if (!open || !editingId) return;
    let cancelled = false;
    setLoading(true);
    axios
      .get<{ connections: ExistingConnection[] }>("/api/admin/marketing-platform-connections")
      .then((r) => {
        if (cancelled) return;
        const found = r.data.connections.find((c) => c.id === editingId);
        if (!found) return;
        setPlatform(found.platform as PlatformKey);
        setEnabled(found.enabled);
        setDefaultForPlatform(found.defaultForPlatform ?? false);
        setLocales(found.supportedLocales);
        setCountries(found.supportedCountries);
        setForm({
          name: found.name,
          accountId: found.accountId ?? "",
          accountName: found.accountName ?? "",
          businessId: found.businessId ?? "",
          managerAccountId: found.managerAccountId ?? "",
          pixelId: found.pixelId ?? "",
          datasetId: found.datasetId ?? "",
          conversionId: found.conversionId ?? "",
          conversionLabel: found.conversionLabel ?? "",
          advertiserId: found.advertiserId ?? "",
          appId: found.appId ?? "",
          propertyId: found.propertyId ?? "",
          streamId: found.streamId ?? "",
          messagingServiceSid: found.messagingServiceSid ?? "",
          senderId: found.senderId ?? "",
          whatsappSender: found.whatsappSender ?? "",
          smsSender: found.smsSender ?? "",
          emailSender: found.emailSender ?? "",
          defaultCurrency: found.defaultCurrency ?? "",
          notes: found.notes ?? "",
          accessToken: found.accessTokenMasked ?? "",
          refreshToken: found.refreshTokenMasked ?? "",
          authToken: found.authTokenMasked ?? "",
          appSecret: found.appSecretMasked ?? "",
          clientSecret: found.clientSecretMasked ?? "",
          developerToken: found.developerTokenMasked ?? "",
          apiSecret: found.apiSecretMasked ?? "",
        });
        setSecretPresence({
          accessToken: found.accessTokenPresent,
          refreshToken: found.refreshTokenPresent,
          authToken: found.authTokenPresent,
          appSecret: found.appSecretPresent,
          clientSecret: found.clientSecretPresent,
          developerToken: found.developerTokenPresent,
          apiSecret: found.apiSecretPresent,
        });
        setClearSecret({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, editingId]);

  React.useEffect(() => {
    if (open || editingId) return;
    setForm({ name: "" });
    setSecretPresence({});
    setClearSecret({});
    setLocales(["ar"]);
    setCountries([]);
    setEnabled(true);
    setDefaultForPlatform(false);
  }, [open, editingId]);

  React.useEffect(() => {
    if (open && !editingId && initialPlatform) setPlatform(initialPlatform);
  }, [open, editingId, initialPlatform]);

  const setField = (k: string, v: string) => setForm((prev) => ({ ...prev, [k]: v }));
  const toggleLocale = (loc: string) => setLocales((prev) => prev.includes(loc) ? prev.filter((l) => l !== loc) : [...prev, loc]);
  const toggleCountry = (cc: string) => setCountries((prev) => prev.includes(cc) ? prev.filter((c) => c !== cc) : [...prev, cc]);

  const checklist = React.useMemo(() => {
    const merged: Record<string, unknown> = { ...form };
    const isMissing = (field: RequirementField): boolean => {
      if (field.secret && secretPresence[field.field]) return false;
      if (field.field.includes("|")) {
        return !field.field.split("|").some((f) => {
          const v = merged[f];
          return typeof v === "string" && v.trim().length > 0;
        });
      }
      const v = merged[field.field];
      return !(typeof v === "string" && v.trim().length > 0);
    };
    const reqMissing = reqs.required.filter(isMissing);
    const optMissing = reqs.optional.filter(isMissing);
    const totalSlots = reqs.required.length + reqs.optional.length;
    const filledSlots = totalSlots - reqMissing.length - optMissing.length;
    const completion = totalSlots === 0 ? 0 : Math.round((filledSlots / totalSlots) * 100);
    return { reqMissing, optMissing, completion };
  }, [form, reqs, secretPresence]);

  const isMaskedSentinel = (val: string): boolean => /^•+$/.test(val.trim()) || /^[A-Za-z0-9_-]{4}…[A-Za-z0-9_-]{4}$/.test(val.trim());

  const submit = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        category: PLATFORM_CATEGORY[platform],
        platform,
        name: form.name ?? "",
        accountId: form.accountId ?? null,
        accountName: form.accountName ?? null,
        businessId: form.businessId ?? null,
        managerAccountId: form.managerAccountId ?? null,
        pixelId: form.pixelId ?? null,
        datasetId: form.datasetId ?? null,
        conversionId: form.conversionId ?? null,
        conversionLabel: form.conversionLabel ?? null,
        advertiserId: form.advertiserId ?? null,
        appId: form.appId ?? null,
        propertyId: form.propertyId ?? null,
        streamId: form.streamId ?? null,
        messagingServiceSid: form.messagingServiceSid ?? null,
        senderId: form.senderId ?? null,
        whatsappSender: form.whatsappSender ?? null,
        smsSender: form.smsSender ?? null,
        emailSender: form.emailSender ?? null,
        defaultCurrency: form.defaultCurrency || null,
        notes: form.notes ?? null,
        supportedLocales: locales,
        supportedCountries: countries,
        enabled,
        defaultForPlatform,
      };
      const secretKeys = ["accessToken", "refreshToken", "authToken", "appSecret", "clientSecret", "developerToken", "apiSecret"];
      for (const k of secretKeys) {
        const v = form[k] ?? "";
        if (v && !isMaskedSentinel(v)) body[k] = v;
        if (clearSecret[k]) body[`clear_${k}`] = true;
      }

      if (editingId) {
        await axios.patch(`/api/admin/marketing-platform-connections/${editingId}`, body);
        toast.success("تم حفظ التعديلات");
      } else {
        await axios.post("/api/admin/marketing-platform-connections", body);
        toast.success("تم إنشاء الاتصال");
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      const message = axios.isAxiosError(e) && typeof e.response?.data?.error === "string" ? (e.response.data.error as string) : "فشل الحفظ";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-[720px] overflow-y-auto" dir="rtl">
        <SheetHeader className="text-right">
          <SheetTitle>{editingId ? "تعديل اتصال" : "إضافة اتصال جديد"}</SheetTitle>
          <SheetDescription>
            هذا القسم يجهّز حسابات المنصات للمزامنة والتقارير. إعدادات البكسل الفعلية تدار من صفحة البكسلات والتتبع.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> جاري التحميل…
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <Label className="text-[11px] text-slate-600 mb-1 block">المنصة</Label>
              <select value={platform} onChange={(e) => setPlatform(e.target.value as PlatformKey)} disabled={!!editingId} className="w-full h-9 px-3 text-xs rounded-lg border border-slate-200 bg-slate-50 disabled:opacity-60">
                {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
              </select>
            </div>

            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-[12px] text-sky-900 leading-relaxed">
              <strong>تنبيه:</strong> هذا الاتصال لا يغيّر Pixel/CAPI/GA4 المستخدم فعليًا في الموقع. لاستخدام القيم في التتبع المباشر انتقل إلى قسم «إعدادات البكسلات والتتبع».
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-[11px] text-slate-600">اكتمال الإعداد: <span className="font-semibold text-slate-900">{checklist.completion}%</span></div>
                <div className="text-[11px] text-slate-500">{reqs.setupGuideAr}</div>
              </div>
              <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden"><div className={cn("h-full transition-all", checklist.completion === 100 ? "bg-emerald-500" : checklist.completion >= 60 ? "bg-amber-400" : "bg-rose-500")} style={{ width: `${checklist.completion}%` }} /></div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label className="text-[11px] text-slate-600 mb-1 block">اسم الاتصال <span className="text-rose-500">*</span></Label><Input value={form.name ?? ""} onChange={(e) => setField("name", e.target.value)} placeholder="مثلاً Meta — حساب فرنسا" /></div>
              <div><Label className="text-[11px] text-slate-600 mb-1 block">العملة الافتراضية</Label><Input value={form.defaultCurrency ?? ""} onChange={(e) => setField("defaultCurrency", e.target.value.toUpperCase())} placeholder="USD" /></div>
            </div>

            <label className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <input type="checkbox" checked={defaultForPlatform} onChange={(e) => setDefaultForPlatform(e.target.checked)} className="accent-amber-600" />
              <Star className="w-3.5 h-3.5" />
              اجعل هذا الاتصال الافتراضي لهذه المنصة لاحقًا في المزامنة والتقارير
            </label>

            <FieldGroup title="الحقول المطلوبة" fields={reqs.required} form={form} setField={setField} secretPresence={secretPresence} clearSecret={clearSecret} setClearSecret={setClearSecret} required />
            <FieldGroup title="حقول اختيارية" fields={reqs.optional} form={form} setField={setField} secretPresence={secretPresence} clearSecret={clearSecret} setClearSecret={setClearSecret} required={false} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-slate-600 mb-1 block">اللغات المدعومة</Label>
                <div className="flex flex-wrap gap-1.5">{SUPPORTED_MARKETING_LOCALES.map((l) => <button type="button" key={l} onClick={() => toggleLocale(l)} className={cn("px-2 py-0.5 rounded-full border text-[11px]", locales.includes(l) ? "bg-brand text-white border-brand" : "bg-white border-slate-200 text-slate-700")}>{getLocaleLabel(l)}</button>)}</div>
              </div>
              <div>
                <Label className="text-[11px] text-slate-600 mb-1 block">الدول المدعومة</Label>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">{SUPPORTED_MARKETING_COUNTRIES.map((c) => <button type="button" key={c} onClick={() => toggleCountry(c)} className={cn("px-2 py-0.5 rounded-full border text-[11px]", countries.includes(c) ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-slate-200 text-slate-700")}>{c} {getCountryLabel(c)}</button>)}</div>
              </div>
            </div>

            <div><Label className="text-[11px] text-slate-600 mb-1 block">ملاحظات</Label><textarea value={form.notes ?? ""} onChange={(e) => setField("notes", e.target.value)} rows={3} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50" placeholder="ملاحظات حرة (اختياري)" /></div>

            <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-brand" />تفعيل الاتصال</label>

            <div className={cn("rounded-lg border p-3 flex items-start gap-2", checklist.reqMissing.length === 0 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800")}>
              {checklist.reqMissing.length === 0 ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <AlertCircle className="w-4 h-4 mt-0.5" />}
              <div className="text-[12px]">
                {checklist.reqMissing.length === 0 ? "كل الحقول المطلوبة مكتملة — يمكنك الحفظ ثم الاختبار." : "أكمل الحقول المطلوبة لتفعيل الاتصال:"}
                {checklist.reqMissing.length > 0 ? <ul className="mt-1 space-y-0.5 list-disc pe-4">{checklist.reqMissing.map((f) => <li key={f.field} className="text-[11px]">{f.guidanceAr}</li>)}</ul> : null}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600 leading-relaxed">
              يتم إخفاء الأسرار في الواجهة ولا تُسجَّل في سجل المراجعة. التشفير داخل قاعدة البيانات غير مفعّل بعد وسيُضاف في خطوة أمان مستقلة.
            </div>

            <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-white">
              <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
              <Button onClick={submit} disabled={saving || !form.name}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{editingId ? "حفظ التعديلات" : "إنشاء"}</Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function FieldGroup({ title, fields, form, setField, secretPresence, clearSecret, setClearSecret, required }: { title: string; fields: RequirementField[]; form: FormState; setField: (k: string, v: string) => void; secretPresence: Record<string, boolean>; clearSecret: Record<string, boolean>; setClearSecret: (s: Record<string, boolean>) => void; required: boolean; }) {
  if (fields.length === 0) return null;
  return <div className="rounded-lg border border-slate-200 bg-white p-3"><h4 className="text-[11px] font-semibold text-slate-700 mb-2">{title}</h4><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{fields.map((f) => {
    const key = f.field.includes("|") ? f.field.split("|")[0] : f.field;
    const value = pickFieldFromForm(form, f.field);
    return <div key={f.field}><Label className="text-[11px] text-slate-600 mb-1 flex items-center gap-1">{f.labelAr}{required ? <span className="text-rose-500">*</span> : null}{f.secret ? <span className="text-[10px] text-slate-400 mr-auto">سري</span> : null}</Label>{f.secret ? <div className="flex items-center gap-1.5"><Input type="password" value={value} onChange={(e) => setField(key, e.target.value)} placeholder={secretPresence[key] ? "محفوظ — اتركه فارغًا للإبقاء عليه" : "أدخل السر"} />{secretPresence[key] ? <button type="button" onClick={() => setClearSecret({ ...clearSecret, [key]: !clearSecret[key] })} className={cn("h-9 px-2 rounded-lg border text-[11px]", clearSecret[key] ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-white text-slate-600 border-slate-200")} title="مسح السر المحفوظ"><Trash2 className="w-3.5 h-3.5" /></button> : null}</div> : <Input value={value} onChange={(e) => setField(key, e.target.value)} placeholder={f.labelAr} />}{f.guidanceAr ? <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{f.guidanceAr}</p> : null}</div>;
  })}</div></div>;
}

export type { PlatformRequirements };
export { ALL_PLATFORM_REQUIREMENTS };
