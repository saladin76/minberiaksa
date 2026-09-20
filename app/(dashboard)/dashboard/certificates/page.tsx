"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Award, ExternalLink, Loader2, RefreshCw, Save } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/dashboard/client-error-message";
import { LOCALES, SUPPORTED_LOCALES } from "@/lib/locales";
import {
  RECEIPT_FIELDS,
  RECEIPT_ORG_DEFAULTS,
  THANKS_FIELDS,
  WAQF_FIELDS,
  type CertificateCopyOverrides,
  type CertificateTemplateId,
  type ReceiptOrgData,
} from "@/lib/certificates/copy-defaults";

/**
 * The wording on the three documents — thank-you certificate, waqf
 * certificate, donation receipt — per template and per locale
 * (`CERTIFICATES_DOWNLOADS_HANDOFF §4`).
 *
 * Every field shows its i18n default as the placeholder; typing over it stores
 * an override for that locale only, and clearing the box returns the field to
 * the default. Nothing here touches the Qur'anic verses — those are locked.
 * The foundation's registration data on the receipt is one set for every
 * language, in Latin script as the Turkish register has it.
 */

type FieldDef = { name: string; label: string; i18nKey: string | null; multiline?: boolean };

const TEMPLATES: ReadonlyArray<{ id: CertificateTemplateId; title: string; hint: string; fields: readonly FieldDef[] }> = [
  { id: "thanks", title: "شهادة الشكر", hint: "تُصدر لكل تبرع مؤكد — النسخة العرضية هي المعتمدة وتُرسل بالبريد.", fields: THANKS_FIELDS },
  { id: "waqf", title: "شهادة الوقف", hint: "تُصدر لكل سهم/متر وقفي في الطلب. نصوص الإنجليزية والتركية معتمدة حرفيًا من الشهادات المطبوعة — لا تُعاد صياغتها.", fields: WAQF_FIELDS },
  { id: "receipt", title: "إيصال التبرع", hint: "المستند المحاسبي: بلا شعارات ولا عبارات وجدانية. يُصدر بلغة المتبرع وبنسخة تركية.", fields: RECEIPT_FIELDS },
];

type Defaults = Record<string, Record<string, Record<string, string>>>;

export default function CertificateCopyPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [overrides, setOverrides] = useState<CertificateCopyOverrides>({});
  const [defaults, setDefaults] = useState<Defaults>({});
  const [template, setTemplate] = useState<CertificateTemplateId>("thanks");
  const [locale, setLocale] = useState<string>("ar");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/certificates/copy");
      setOverrides(res.data.overrides ?? {});
      setDefaults(res.data.defaults ?? {});
      setUpdatedAt(res.data.updatedAt ?? null);
    } catch (e) {
      toast({ title: "خطأ", description: errorMessage(e, "تعذّر تحميل نصوص الشهادات"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await axios.put("/api/certificates/copy", { overrides });
      setOverrides(res.data.overrides ?? {});
      setUpdatedAt(res.data.updatedAt ?? null);
      toast({ title: "تم الحفظ", description: "نصوص الشهادات محفوظة وتُطبَّق على كل مستند يُصدر من الآن." });
    } catch (e) {
      toast({ title: "خطأ", description: errorMessage(e, "تعذّر الحفظ"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const valueOf = (tpl: CertificateTemplateId, loc: string, field: string): string =>
    (overrides[tpl] as Record<string, Record<string, string>> | undefined)?.[loc]?.[field] ?? "";

  const setValue = (tpl: CertificateTemplateId, loc: string, field: string, value: string) =>
    setOverrides((prev) => {
      const section = { ...((prev[tpl] as Record<string, Record<string, string>> | undefined) ?? {}) };
      const row = { ...(section[loc] ?? {}) };
      if (value.trim()) row[field] = value;
      else delete row[field];
      if (Object.keys(row).length) section[loc] = row;
      else delete section[loc];
      return { ...prev, [tpl]: section };
    });

  const org: ReceiptOrgData = useMemo(() => ({ ...RECEIPT_ORG_DEFAULTS, ...(overrides.receiptOrg ?? {}) }), [overrides.receiptOrg]);
  const setOrg = (key: keyof ReceiptOrgData, value: string) =>
    setOverrides((prev) => {
      const next = { ...(prev.receiptOrg ?? {}) };
      if (value.trim() && value.trim() !== RECEIPT_ORG_DEFAULTS[key]) next[key] = value;
      else delete next[key];
      return { ...prev, receiptOrg: Object.keys(next).length ? next : undefined };
    });

  const overriddenCount = (tpl: CertificateTemplateId, loc: string) =>
    Object.keys((overrides[tpl] as Record<string, Record<string, string>> | undefined)?.[loc] ?? {}).length;

  const current = TEMPLATES.find((t) => t.id === template)!;

  return (
    <div className="space-y-5">
      <PageHeader
        title="نصوص الشهادات والإيصال"
        description="الصياغة التي تُطبع على شهادة الشكر وشهادة الوقف وإيصال التبرع، لكل قالب ولكل لغة. الفارغ يعني النص الافتراضي من حزمة الترجمة."
        icon={Award}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="ml-1 h-4 w-4" /> تحديث
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving || loading}>
              {saving ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <Save className="ml-1 h-4 w-4" />} حفظ
            </Button>
          </div>
        }
      />

      {updatedAt ? <p className="text-xs text-muted-foreground">آخر حفظ: {new Date(updatedAt).toLocaleString("ar-EG")}</p> : null}

      <Tabs value={template} onValueChange={(v) => setTemplate(v as CertificateTemplateId)}>
        <TabsList>
          {TEMPLATES.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>{t.title}</TabsTrigger>
          ))}
        </TabsList>
        {TEMPLATES.map((t) => (
          <TabsContent key={t.id} value={t.id}>
            <p className="mb-3 text-sm text-muted-foreground">{t.hint}</p>
          </TabsContent>
        ))}
      </Tabs>

      {template === "receipt" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">بيانات المؤسسة الرسمية</CardTitle>
            <CardDescription>تُطبع بالحروف اللاتينية كما في السجل التركي، في كل اللغات — لا تُترجم.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {(
              [
                ["orgLegalName", "الاسم القانوني"],
                ["taxNo", "الرقم الضريبي"],
                ["orgAddress", "العنوان"],
                ["orgContact", "البريد / التواصل"],
              ] as Array<[keyof ReceiptOrgData, string]>
            ).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label>{label}</Label>
                <Input dir="ltr" value={org[key]} onChange={(e) => setOrg(key, e.target.value)} placeholder={RECEIPT_ORG_DEFAULTS[key]} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{current.title} — حسب اللغة</CardTitle>
          <CardDescription>اختر اللغة ثم عدّل الحقول. يظهر النص الافتراضي كتلميح داخل كل حقل.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل…</div>
          ) : (
            <Tabs value={locale} onValueChange={setLocale}>
              <TabsList className="flex h-auto flex-wrap justify-start">
                {SUPPORTED_LOCALES.map((loc) => {
                  const n = overriddenCount(template, loc);
                  return (
                    <TabsTrigger key={loc} value={loc} className="gap-1">
                      {LOCALES[loc]?.label ?? loc}
                      {n ? <Badge variant="secondary" className="px-1 text-[10px]">{n}</Badge> : null}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              {SUPPORTED_LOCALES.map((loc) => (
                <TabsContent key={loc} value={loc} className="mt-4 grid gap-4" dir={LOCALES[loc]?.direction ?? "ltr"}>
                  {current.fields.map((field) => {
                    const placeholder = defaults[loc]?.[template]?.[field.name] ?? "";
                    const value = valueOf(template, loc, field.name);
                    return (
                      <div key={field.name} className="space-y-1">
                        <Label className="flex items-center justify-between gap-2">
                          <span>{field.label}</span>
                          {value ? <span className="text-[11px] font-normal text-amber-700">معدّل</span> : <span className="text-[11px] font-normal text-muted-foreground">الافتراضي</span>}
                        </Label>
                        {field.multiline ? (
                          <Textarea rows={4} value={value} onChange={(e) => setValue(template, loc, field.name, e.target.value)} placeholder={placeholder} />
                        ) : (
                          <Input value={value} onChange={(e) => setValue(template, loc, field.name, e.target.value)} placeholder={placeholder} />
                        )}
                      </div>
                    );
                  })}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        الآيات القرآنية على شهادة الشكر ثابتة من حزمة <code>quran</code> ولا تُعدَّل من هنا. تخطيط شهادة الشكر الطولي متاح للمشرف من صفحة الشهادة بإضافة <code>?layout=portrait</code>{" "}
        <ExternalLink className="inline h-3 w-3" />
      </p>
    </div>
  );
}
