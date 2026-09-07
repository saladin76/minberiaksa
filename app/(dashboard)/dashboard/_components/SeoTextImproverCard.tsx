"use client";

import { useMemo, useState } from "react";
import axios from "axios";
import { Check, Clipboard, FileQuestion, FileText, Hash, Heading2, Loader2, Link, ListChecks, Send, Sparkles, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { SupportedLocale } from "@/lib/locales";
import { Textarea } from "@/components/ui/textarea";

type SeoContentType = "campaign" | "category" | "blog";
/**
 * Every publicly routed locale. Derived from the single source of truth rather
 * than listed here, so promoting a locale cannot leave this behind — which is
 * exactly what happened when the Minbar port took the site from 8 to 19.
 */
type LocaleCode = SupportedLocale;
type FaqItem = { question: string; answer: string };

type SeoTextResult = {
  improvedTitle: string;
  improvedText: string;
  metaDescription: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  suggestedHeadings: string[];
  suggestedSlug: string;
  faq: FaqItem[];
  notes: string[];
  keywords: string[];
};

type Props = {
  type: SeoContentType;
  locale?: LocaleCode;
  title?: string | null;
  text?: string | null;
  keywords?: string[];
  onApply?: (text: string) => void;
};

const emptyResult: SeoTextResult = {
  improvedTitle: "",
  improvedText: "",
  metaDescription: "",
  primaryKeyword: "",
  secondaryKeywords: [],
  suggestedHeadings: [],
  suggestedSlug: "",
  faq: [],
  notes: [],
  keywords: [],
};

export function SeoTextImproverCard({ type, locale = "ar", title, text, keywords = [], onApply }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SeoTextResult>(emptyResult);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [sentToSeo, setSentToSeo] = useState(false);

  const hasText = Boolean((text || title || "").trim());
  const hasResult = Boolean(result.improvedText || result.improvedTitle || result.primaryKeyword || result.faq.length);
  const allKeywords = useMemo(() => {
    const values = [result.primaryKeyword, ...result.secondaryKeywords, ...result.keywords].map((x) => x?.trim()).filter(Boolean);
    return Array.from(new Set(values));
  }, [result]);

  const faqText = useMemo(() => {
    return result.faq.map((item, index) => `${index + 1}. ${item.question}\n${item.answer}`).join("\n\n");
  }, [result.faq]);

  const seoPackageText = useMemo(() => {
    return [
      `عنوان SEO: ${result.improvedTitle || "—"}`,
      `وصف Meta: ${result.metaDescription || "—"}`,
      `الكلمة الرئيسية: ${result.primaryKeyword || "—"}`,
      `الكلمات المفتاحية: ${allKeywords.join(", ") || "—"}`,
      `Slug مقترح: ${result.suggestedSlug || "—"}`,
      result.suggestedHeadings.length ? `العناوين المقترحة:\n${result.suggestedHeadings.map((h, i) => `${i + 1}. ${h}`).join("\n")}` : "",
      result.faq.length ? `الأسئلة الشائعة:\n${faqText}` : "",
    ].filter(Boolean).join("\n\n");
  }, [result, allKeywords, faqText]);

  const improve = async () => {
    if (!hasText) return;
    setLoading(true);
    setError(null);
    setApplied(false);
    setSentToSeo(false);
    try {
      const response = await axios.post("/api/admin/seo/text-improve", {
        type,
        locale,
        title: title || "",
        text: text || "",
        keywords,
      });
      setResult({
        improvedTitle: response.data?.improvedTitle || title || "",
        improvedText: response.data?.improvedText || "",
        metaDescription: response.data?.metaDescription || "",
        primaryKeyword: response.data?.primaryKeyword || "",
        secondaryKeywords: response.data?.secondaryKeywords || [],
        suggestedHeadings: response.data?.suggestedHeadings || [],
        suggestedSlug: response.data?.suggestedSlug || "",
        faq: response.data?.faq || [],
        notes: response.data?.notes || [],
        keywords: response.data?.keywords || [],
      });
    } catch (err: any) {
      setError(err?.response?.data?.error || "تعذر تحسين النص الآن");
    } finally {
      setLoading(false);
    }
  };

  const copy = async (key: string, value: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1500);
  };

  const apply = () => {
    if (!result.improvedText || !onApply) return;
    onApply(result.improvedText);
    setApplied(true);
    window.setTimeout(() => setApplied(false), 1800);
  };

  const sendToSeoWorkbench = () => {
    if (!hasResult) return;
    const payload = {
      source: "seo-text-improver",
      type,
      locale,
      seoTitle: result.improvedTitle,
      metaDescription: result.metaDescription,
      primaryKeyword: result.primaryKeyword,
      keywords: allKeywords,
      longTailKeywords: result.suggestedHeadings,
      suggestedSlug: result.suggestedSlug,
      faq: result.faq,
      improvedText: result.improvedText,
      sentAt: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem(`seo-assistant:${type}:${locale}`, JSON.stringify(payload));
    } catch {}
    window.dispatchEvent(new CustomEvent("seo-assistant:structured-suggestions", { detail: payload }));
    setSentToSeo(true);
    window.setTimeout(() => setSentToSeo(false), 2200);
  };

  const updateFaq = (index: number, patch: Partial<FaqItem>) => {
    setResult((prev) => ({
      ...prev,
      faq: prev.faq.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  };

  return (
    <Card className="border-purple-100 bg-gradient-to-br from-white to-purple-50/40 shadow-sm" dir="rtl">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-purple-100 p-2 text-purple-700">
              <WandSparkles className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg">تحسين النص للظهور</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">يرتب النص كمسودة SEO احترافية: عنوان، جسم النص، كلمة رئيسية، وصف Meta، عناوين وأسئلة شائعة.</p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={improve} disabled={loading || !hasText} className="gap-2 border-purple-300 text-purple-700 hover:bg-purple-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            تحسين وترتيب النص
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasText && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">اكتب العنوان أو الوصف أولًا حتى يتم تجهيز اقتراح مناسب.</div>}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {hasResult && (
          <>
            <div className="rounded-xl border border-purple-200 bg-white p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm font-bold text-slate-900">حزمة SEO جاهزة للمراجعة</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">بعد المراجعة يمكنك إرسال العنوان والوصف والكلمات والأسئلة إلى أداة SEO الذكي في نفس اللغة.</p>
                </div>
                <Button type="button" size="sm" onClick={sendToSeoWorkbench} className="gap-2 bg-brand hover:bg-brand-dark">
                  <Send className="h-4 w-4" />
                  {sentToSeo ? "تم الإرسال" : "إرسال إلى SEO الذكي"}
                </Button>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <InfoField icon={<Heading2 className="h-4 w-4" />} label="عنوان محسّن" value={result.improvedTitle} onCopy={() => copy("title", result.improvedTitle)} copied={copiedKey === "title"} />
              <InfoField icon={<Hash className="h-4 w-4" />} label="الكلمة الرئيسية" value={result.primaryKeyword} onCopy={() => copy("primary", result.primaryKeyword)} copied={copiedKey === "primary"} />
              <InfoField icon={<FileText className="h-4 w-4" />} label="وصف Meta" value={result.metaDescription} onCopy={() => copy("meta", result.metaDescription)} copied={copiedKey === "meta"} area />
              <InfoField icon={<Link className="h-4 w-4" />} label="Slug مقترح" value={result.suggestedSlug} onCopy={() => copy("slug", result.suggestedSlug)} copied={copiedKey === "slug"} />
            </div>

            {allKeywords.length > 0 && (
              <div className="rounded-xl border bg-white p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800"><Hash className="h-4 w-4 text-purple-700" /> كلمات مفتاحية مرتبطة بأداة SEO</div>
                <div className="flex flex-wrap gap-1.5">
                  {allKeywords.map((kw) => <span key={kw} className="rounded-full border bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-800">{kw}</span>)}
                </div>
              </div>
            )}

            {result.suggestedHeadings.length > 0 && (
              <div className="rounded-xl border bg-white p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800"><ListChecks className="h-4 w-4 text-purple-700" /> هيكل العناوين المقترح</div>
                <div className="grid gap-2 md:grid-cols-2">
                  {result.suggestedHeadings.map((heading, i) => <div key={`${heading}-${i}`} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">{i + 1}. {heading}</div>)}
                </div>
              </div>
            )}

            {result.faq.length > 0 && (
              <div className="rounded-xl border bg-white p-3">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><FileQuestion className="h-4 w-4 text-purple-700" /> أسئلة شائعة مقترحة</div>
                    <p className="mt-1 text-xs text-muted-foreground">يمكن مراجعتها وتعديلها ثم إرسالها إلى أداة SEO الذكي لاستخدامها مع البيانات المنظمة لاحقًا.</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => copy("faq", faqText)} className="gap-2">
                    <Clipboard className="h-4 w-4" />
                    {copiedKey === "faq" ? "تم النسخ" : "نسخ الأسئلة"}
                  </Button>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {result.faq.map((item, index) => (
                    <div key={`${item.question}-${index}`} className="rounded-lg border bg-slate-50 p-3">
                      <label className="text-xs font-semibold text-muted-foreground">السؤال {index + 1}</label>
                      <Input value={item.question} onChange={(e) => updateFaq(index, { question: e.target.value })} className="mt-1 bg-white text-sm font-semibold" />
                      <label className="mt-3 block text-xs font-semibold text-muted-foreground">الإجابة</label>
                      <Textarea value={item.answer} onChange={(e) => updateFaq(index, { answer: e.target.value })} className="mt-1 min-h-[85px] bg-white text-sm leading-6" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-800">النص المحسّن والمنسق</label>
              <Textarea value={result.improvedText} onChange={(e) => setResult((prev) => ({ ...prev, improvedText: e.target.value }))} className="min-h-[240px] bg-white leading-7" />
              <p className="text-xs text-muted-foreground">يمكنك مراجعة النص وتعديله قبل النسخ أو الاستخدام.</p>
            </div>

            {result.notes.length > 0 && (
              <div className="rounded-lg bg-white/80 p-3 text-xs leading-6 text-slate-600">
                {result.notes.map((note) => <div key={note}>• {note}</div>)}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {onApply && (
                <Button type="button" size="sm" onClick={apply} className="gap-2 bg-purple-700 hover:bg-purple-800">
                  <Check className="h-4 w-4" />
                  {applied ? "تم وضع النص" : "استخدام النص المقترح"}
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => copy("body", result.improvedText)} className="gap-2">
                <Clipboard className="h-4 w-4" />
                {copiedKey === "body" ? "تم النسخ" : "نسخ النص"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => copy("seo", seoPackageText)} className="gap-2">
                <Clipboard className="h-4 w-4" />
                {copiedKey === "seo" ? "تم النسخ" : "نسخ حزمة SEO"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function InfoField({ icon, label, value, onCopy, copied, area }: { icon: React.ReactNode; label: string; value: string; onCopy: () => void; copied: boolean; area?: boolean }) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">{icon}{label}</div>
        <button type="button" onClick={onCopy} disabled={!value} className="inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-[11px] text-slate-600 disabled:opacity-40">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
          {copied ? "تم النسخ" : "نسخ"}
        </button>
      </div>
      {area ? <Textarea value={value || ""} readOnly className="min-h-[78px] resize-none bg-slate-50 text-sm" /> : <Input value={value || ""} readOnly className="bg-slate-50 text-sm" />}
    </div>
  );
}
