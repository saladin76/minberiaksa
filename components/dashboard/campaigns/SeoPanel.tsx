"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Save, Search, Share2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { LOCALES, SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/locales";
import { reviewSeoDraft } from "@/app/api/admin/seo/seo-dashboard-quality";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dashDir, dt } from "@/lib/dashboard/i18n";

type SeoFields = {
  seoTitle: string; seoDescription: string; seoKeyword: string;
  ogTitle: string; ogDescription: string; ogImage: string;
  imageAlt: string; seoNoIndex: string; faqContent: string;
};
type SeoResponse = {
  campaignId: string; locale: SupportedLocale; hasTranslation: boolean;
  localeSeo: SeoFields; defaultSeo: SeoFields; contentTitle: string;
  contentDescription: string; slug: string; defaultImage: string; revision: string | null;
};
const keys: (keyof SeoFields)[] = [
  "seoTitle", "seoDescription", "seoKeyword", "ogTitle", "ogDescription",
  "ogImage", "imageAlt", "seoNoIndex", "faqContent",
];
const blank = (): SeoFields => ({
  seoTitle: "", seoDescription: "", seoKeyword: "", ogTitle: "",
  ogDescription: "", ogImage: "", imageAlt: "", seoNoIndex: "", faqContent: "",
});
function normalize(raw: Partial<SeoFields>): SeoFields {
  return Object.fromEntries(keys.map((key) => [key, typeof raw[key] === "string" ? raw[key] : ""])) as SeoFields;
}
function parseFaq(raw: string): { q: string; a: string }[] | null {
  if (!raw.trim()) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return null;
    if (value.some((item) => !item || typeof item !== "object" ||
      typeof item.q !== "string" || typeof item.a !== "string")) return null;
    return value.map((item) => ({ q: item.q, a: item.a }));
  } catch { return null; }
}
function size(value: string) { return Array.from(value).length; }
function validImage(url: string) {
  const value = url.trim();
  return !value || (value.startsWith("/") && !value.startsWith("//")) || /^https:\/\//i.test(value);
}

export function SeoPanel({ campaignId }: { campaignId: string }) {
  const [locale, setLocale] = useState<SupportedLocale>("ar");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [readError, setReadError] = useState("");
  const [document, setDocument] = useState<SeoResponse | null>(null);
  const [fields, setFields] = useState<SeoFields>(blank);
  const [saved, setSaved] = useState<SeoFields>(blank);
  const generation = useRef(0);
  const dirty = useMemo(() => JSON.stringify(fields) !== JSON.stringify(saved), [fields, saved]);
  const isBusy = loading || saving;
  const currentLocale = LOCALES[locale];
  const issues = reviewSeoDraft({
    locale, contentTitle: document?.contentTitle, seoTitle: fields.seoTitle,
    metaDescription: fields.seoDescription, seoKeyword: fields.seoKeyword,
    ogTitle: fields.ogTitle, ogDescription: fields.ogDescription,
    ogImage: fields.ogImage || document?.defaultImage || "",
    imageAlt: fields.imageAlt, seoNoIndex: fields.seoNoIndex, faqContent: fields.faqContent,
  });
  const blocking = issues.some((issue) => issue.severity === "error");
  const endpoint = "/api/admin/seo/projects/" + encodeURIComponent(campaignId);
  const load = useCallback(async (target: SupportedLocale, signal?: AbortSignal) => {
    const token = ++generation.current;
    setLoading(true); setReadError(""); setDocument(null);
    try {
      const response = await fetch(endpoint + "?locale=" + encodeURIComponent(target), { cache: "no-store", signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || dt("تعذر قراءة إعدادات SEO."));
      if (signal?.aborted || token !== generation.current) return;
      if (body.locale !== target) throw new Error(dt("النتيجة لا تخص اللغة المطلوبة."));
      const next = normalize(body.localeSeo || {});
      setFields(next); setSaved(next); setDocument(body as SeoResponse);
    } catch (error) {
      if (signal?.aborted || token !== generation.current) return;
      setReadError(error instanceof Error ? error.message : dt("تعذر تحميل SEO."));
    } finally {
      if (!signal?.aborted && token === generation.current) setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    void load(locale, controller.signal);
    return () => { generation.current++; controller.abort(); };
  }, [locale, load]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const edit = (key: keyof SeoFields, value: string) => {
    if (isBusy) return;
    setFields((previous) => ({ ...previous, [key]: value }));
  };
  const save = async () => {
    if (isBusy || !document?.hasTranslation || !document.revision || !dirty || blocking) return;
    setSaving(true);
    try {
      const response = await fetch(endpoint, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, revision: document.revision, fields }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || dt("تعذر حفظ SEO."));
      const verified = normalize(body.localeSeo || {});
      if (JSON.stringify(verified) !== JSON.stringify(normalize(fields)))
        throw new Error(dt("لم تتطابق البيانات المقروءة مع المسودة؛ أعد تحميل الصفحة."));
      setSaved(verified); setFields(verified); setDocument(body as SeoResponse);
      toast.success(dt("تم الحفظ والتحقق من بيانات هذه اللغة."));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : dt("تعذر تأكيد الحفظ."));
    } finally { setSaving(false); }
  };
  const changeLocale = (value: string) => {
    if (!SUPPORTED_LOCALES.some((candidate) => candidate === value) || isBusy || value === locale) return;
    if (dirty && !window.confirm(dt("تعديلات SEO لهذه اللغة غير محفوظة. هل تريد تجاهلها؟"))) return;
    setLocale(value as SupportedLocale);
  };
  const faq = parseFaq(fields.faqContent);
  const writeFaq = (items: { q: string; a: string }[]) => edit("faqContent", items.length ? JSON.stringify(items) : "");
  const titleLimit = locale === "ja" || locale === "zh" ? 42 : 70;
  const descriptionLimit = locale === "ja" || locale === "zh" ? 90 : 160;
  const title = fields.seoTitle || document?.contentTitle || document?.defaultSeo.seoTitle || "";
  const description = fields.seoDescription || document?.contentDescription || document?.defaultSeo.seoDescription || "";
  const ogTitle = fields.ogTitle || title;
  const ogDescription = fields.ogDescription || description;
  const ogImage = fields.ogImage || document?.defaultImage || "";
  return <Card className="space-y-5 p-5" dir={dashDir()}>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-lg font-semibold"><Search className="h-5 w-5 text-brand" />{dt("SEO المشروع")}</h3>
        <p className="mt-1 text-sm text-slate-500">{dt("كل لغة مستقلة؛ الحفظ يغير بيانات البحث فقط ولا يمس محتوى المشروع أو ترجماته.")}</p>
      </div>
      <Button type="button" onClick={() => void save()} disabled={isBusy || !document?.hasTranslation || !document.revision || !dirty || blocking} className="gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {dt("حفظ SEO لهذه اللغة")}
      </Button>
    </header>
    <label className="block space-y-2 text-sm"><span className="font-semibold">{dt("لغة المحتوى")}</span>
      <select className="w-full rounded-lg border bg-white p-3" value={locale} disabled={isBusy} onChange={(event) => changeLocale(event.target.value)}>
        {SUPPORTED_LOCALES.map((code) => <option key={code} value={code}>{LOCALES[code].nativeLabel} ({code.toUpperCase()})</option>)}
      </select>
    </label>
    <div role="status" className="text-sm text-slate-600">
      {currentLocale.nativeLabel} · {dirty ? dt("مسودة غير محفوظة") : dt("لا توجد تعديلات محلية")}
      {document && !document.hasTranslation ? " · " + dt("لا توجد ترجمة محفوظة؛ لا يمكن حفظ SEO لهذه اللغة قبل إنشاء المحتوى.") : ""}
    </div>
    {readError ? <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{readError}<button type="button" className="ms-3 underline" onClick={() => void load(locale)}>{dt("إعادة المحاولة")}</button></p> : null}
    {loading ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />{dt("جار تحميل SEO...")}</p> : null}
    {document && !loading ? <div dir={currentLocale.direction} className="space-y-5">
      {issues.length ? <aside aria-label={dt("تدقيق SEO")} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="font-semibold">{dt("ملاحظات التدقيق التحريري")} ({issues.length})</p>
        <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">{issues.map((issue) => <li key={issue.code} className={issue.severity === "error" ? "text-red-800" : "text-amber-900"}>{issue.message}</li>)}</ul>
      </aside> : <p role="status" className="text-sm text-emerald-800">{dt("لا توجد ملاحظات آلية على هذه المسودة.")}</p>}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="block space-y-2"><Label>{dt("عنوان البحث")} · {size(fields.seoTitle)}/{titleLimit}</Label>
            <Input value={fields.seoTitle} maxLength={160} disabled={isBusy || !document.hasTranslation} onChange={(event) => edit("seoTitle", event.target.value)} placeholder={document.contentTitle} />
          </div>
          <div className="block space-y-2"><Label>{dt("وصف البحث")} · {size(fields.seoDescription)}/{descriptionLimit}</Label>
            <Textarea rows={3} maxLength={220} value={fields.seoDescription} disabled={isBusy || !document.hasTranslation} onChange={(event) => edit("seoDescription", event.target.value)} placeholder={document.contentDescription} />
          </div>
          <div className="block space-y-2"><Label>{dt("العبارة الرئيسية المستهدفة")}</Label>
            <Input maxLength={500} value={fields.seoKeyword} disabled={isBusy || !document.hasTranslation} onChange={(event) => edit("seoKeyword", event.target.value)} />
          </div>
          <div className="block space-y-2"><Label>{dt("عنوان المشاركة")}</Label>
            <Input maxLength={180} value={fields.ogTitle} disabled={isBusy || !document.hasTranslation} onChange={(event) => edit("ogTitle", event.target.value)} />
          </div>
          <div className="block space-y-2"><Label>{dt("وصف المشاركة")}</Label>
            <Textarea maxLength={300} value={fields.ogDescription} disabled={isBusy || !document.hasTranslation} onChange={(event) => edit("ogDescription", event.target.value)} />
          </div>
          <div className="block space-y-2"><Label>{dt("رابط صورة المشاركة")}</Label>
            <Input dir="ltr" className="text-left" maxLength={2048} value={fields.ogImage} disabled={isBusy || !document.hasTranslation} onChange={(event) => edit("ogImage", event.target.value)} />
          </div>
          <div className="block space-y-2"><Label>{dt("الوصف البديل للصورة")}</Label>
            <Input maxLength={200} value={fields.imageAlt} disabled={isBusy || !document.hasTranslation} onChange={(event) => edit("imageAlt", event.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={fields.seoNoIndex !== "true"} disabled={isBusy || !document.hasTranslation} onChange={(event) => edit("seoNoIndex", event.target.checked ? "false" : "true")} />
            {dt("السماح بفهرسة هذه اللغة")}
          </label>
        </div>
        <div className="space-y-4">
          <section className="rounded-lg border bg-white p-4">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Search className="h-4 w-4" />{dt("معاينة نتائج البحث")}</h4>
            <div className="text-xs text-slate-500" dir="ltr">minberiaksa.org / {locale} / {document.slug}</div>
            <p className="mt-2 break-words text-xl text-blue-800">{title || dt("لا يوجد عنوان")}</p>
            <p className="mt-2 break-words text-sm leading-6 text-slate-600">{description || dt("لا يوجد وصف")}</p>
            <p className="mt-2 text-xs text-slate-500">{dt("معاينة تقريبية؛ جوجل قد يختار مقتطفًا مختلفًا.")}</p>
          </section>
          <section className="overflow-hidden rounded-lg border bg-white">
            {ogImage && validImage(ogImage) ? (
              // External image URLs may be served by arbitrary editors' configured hosts.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ogImage} alt={fields.imageAlt || ""} className="h-48 w-full object-cover" />
            ) : <div className="flex h-32 items-center justify-center bg-slate-100 text-sm text-slate-600">{dt("لا توجد صورة مشاركة صالحة")}</div>}
            <div className="space-y-2 p-4">
              <h4 className="flex items-center gap-2 text-sm font-semibold"><Share2 className="h-4 w-4" />{dt("معاينة المشاركة")}</h4>
              <p className="font-semibold">{ogTitle || dt("عنوان المشاركة")}</p>
              <p className="text-sm text-slate-600">{ogDescription || dt("وصف المشاركة")}</p>
            </div>
          </section>
        </div>
      </div>
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">{dt("الأسئلة الشائعة")}</h4>
          <Button type="button" variant="outline" disabled={isBusy || !document.hasTranslation || faq === null || (faq?.length || 0) >= 15} onClick={() => writeFaq([...(faq || []), { q: "", a: "" }])}>{dt("إضافة سؤال")}</Button>
        </div>
        {faq === null ? <p role="alert" className="text-sm text-red-800">{dt("بيانات FAQ غير صالحة. أصلحها يدويًا دون فقدان النص الأصلي.")}</p> : faq.map((item, index) =>
          <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
            <div className="block space-y-1"><Label>{dt("السؤال")} {index + 1}</Label><Input value={item.q} maxLength={240} disabled={isBusy} onChange={(event) => writeFaq(faq.map((v, i) => i === index ? { ...v, q: event.target.value } : v))} /></div>
            <div className="block space-y-1"><Label>{dt("الإجابة")}</Label><Textarea value={item.a} maxLength={2000} disabled={isBusy} onChange={(event) => writeFaq(faq.map((v, i) => i === index ? { ...v, a: event.target.value } : v))} /></div>
            <button type="button" className="text-sm text-red-700 underline" disabled={isBusy} onClick={() => writeFaq(faq.filter((_, i) => i !== index))}>{dt("حذف السؤال")}</button>
          </div>)}
        {faq === null ? <Textarea aria-label={dt("البيانات الأصلية للأسئلة الشائعة")} value={fields.faqContent} onChange={(event) => edit("faqContent", event.target.value)} rows={5} /> : null}
      </section>
    </div> : null}
  </Card>;
}
