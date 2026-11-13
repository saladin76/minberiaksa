'use client';

import { useRef, useState } from 'react';
import axios from 'axios';
import { Loader2, WandSparkles } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { SUPPORTED_LOCALES } from '@/lib/locales';
import { dt } from "@/lib/dashboard/i18n";

/**
 * "Translate into every language" for a dashboard form.
 *
 * The form hands over its Arabic fields; the button posts them to
 * `/api/admin/content-localization/translate` and hands back one record per
 * locale for the form to merge into its own translation state. Nothing is
 * saved by the button: the editor still reviews the tabs and presses the
 * form's own save, so a machine translation never reaches the site unseen.
 *
 * By default only empty fields are filled  an editor's own wording in one
 * language is not thrown away because they asked for the other seventeen.
 * The checkbox opts into replacing everything.
 */

export type TranslatedLocales = Record<string, { fields: Record<string, string>; richFields: Record<string, string>; warnings?: string[] }>;

export function AutoTranslateButton({
  source,
  richSource,
  itemLabel,
  locales,
  onResult,
  size = 'sm',
  disabled,
  sourceLocale = "ar",
  policy = "STANDARD",
}: {
  /** Arabic plain-text fields, by field name. */
  source: Record<string, string>;
  /** Arabic Tiptap JSON documents, by field name. */
  richSource?: Record<string, string>;
  /** Shown to the model  "campaign", "FAQ", "story slide"… */
  itemLabel?: string;
  /** Target locales; every non-Arabic locale when omitted. */
  locales?: readonly string[];
  /** Receives the translations and whether existing text may be replaced. */
  onResult: (translations: TranslatedLocales, overwrite: boolean) => void;
  size?: 'sm' | 'default';
  disabled?: boolean;
  /** Actual source language; Arabic remains the default for existing forms. */
  sourceLocale?: string;
  /** Protect religious/legal content from unsafe machine translation. */
  policy?: "STANDARD" | "LEGAL_REVIEW_REQUIRED" | "RELIGIOUS_LOCKED" | "SEO";
}) {
  const [busy, setBusy] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [report, setReport] = useState<{ done: string[]; failed: Record<string, string>; warnings: Record<string, string[]> } | null>(null);
  const sourceSignature = useRef("");
  sourceSignature.current = JSON.stringify({ source, richSource, sourceLocale, policy });

  const hasSource =
    Object.values(source).some((v) => v && v.trim()) ||
    Object.values(richSource ?? {}).some((v) => v && v.trim());

  const targets = (locales ?? SUPPORTED_LOCALES.filter((l) => l !== 'ar')) as readonly string[];

  const run = async (requestedLocales: readonly string[] = targets) => {
    if (!hasSource) return toast.error(dt("اكتب المحتوى بالعربية أولًا"));
    if (!requestedLocales.length) return;
    const startedWith = sourceSignature.current;
    setBusy(true);
    setReport(null);
    try {
      const res = await axios.post('/api/admin/content-localization/translate', {
        fields: source,
        richFields: richSource ?? {},
        locales: requestedLocales,
        itemLabel,
        sourceLocale,
        policy,
      });
      if (startedWith !== sourceSignature.current) {
        setReport({ done: [], failed: Object.fromEntries(requestedLocales.map(code => [code, dt("تغير النص العربي أثناء الترجمة. أعد الترجمة من النسخة الحالية.")])), warnings: {} });
        toast.error(dt("تغير النص العربي أثناء الترجمة؛ لم تُطبق نتائج قديمة."));
        return;
      }
      const raw = (res.data?.translations ?? {}) as TranslatedLocales;
      const errors = (res.data?.errors ?? {}) as Record<string, string>;
      const translations: TranslatedLocales = {};
      const failures: Record<string, string> = {};
      const warnings: Record<string, string[]> = {};
      for (const code of requestedLocales) {
        // A provider can return partial text alongside an explicit locale error.
        // Such text must never be applied to the editor as a successful translation.
        if (errors[code]) {
          failures[code] = errors[code];
          continue;
        }
        const item = raw[code];
        if (item && typeof item === "object") {
          const fields = Object.fromEntries(Object.entries(item.fields ?? {}).filter(([, value]) => typeof value === "string" && value.trim()));
          const richFields = Object.fromEntries(Object.entries(item.richFields ?? {}).filter(([, value]) => typeof value === "string" && value.trim()));
          if (Object.keys(fields).length || Object.keys(richFields).length) {
            const notes = Array.isArray(item.warnings) ? item.warnings.filter(note => typeof note === "string") : [];
            translations[code] = { fields, richFields, warnings: notes };
            if (notes.length) warnings[code] = notes;
          } else failures[code] = errors[code] || dt("لم تُنتج الخدمة نصًا صالحًا لهذه اللغة");
        } else failures[code] = errors[code] || dt("لم تكتمل ترجمة هذه اللغة");
      }
      const done = Object.keys(translations);
      if (done.length) onResult(translations, overwrite);
      setReport({ done, failed: failures, warnings });
      if (done.length) toast.success(dt("وصلت ترجمة {0} لغة إلى المسودة. راجعها قبل حفظ الكل.", [done.length]));
      if (Object.keys(failures).length) toast.error(dt("تعذرت ترجمة {0} لغة؛ راجع التفاصيل وأعد المحاولة.", [Object.keys(failures).length]));
      if (Object.keys(warnings).length) toast.error(dt("بعض الحقول تحتاج مراجعة بسبب تحذيرات الترجمة."));
      if (!done.length && !Object.keys(failures).length) toast.error(dt("لم تُنتج الترجمة أي نص"));
    } catch (e) {
      const message = errorMessage(e, dt("تعذّرت الترجمة التلقائية"));
      setReport({ done: [], failed: Object.fromEntries(requestedLocales.map(code => [code, message])), warnings: {} });
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={() => void run()}
        disabled={busy || disabled || !hasSource}
        className="gap-2 border-purple-300 text-purple-700 hover:bg-purple-50"
        title={hasSource ? undefined : dt("اكتب المحتوى بالعربية أولًا")}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
        {busy ? dt("جارٍ الترجمة إلى {0} لغة…", [targets.length]) : dt("ترجمة تلقائية إلى {0} لغة", [targets.length])}
      </Button>
      <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
        <Checkbox checked={overwrite} onCheckedChange={(v) => setOverwrite(v === true)} />
        {dt("استبدال الترجمات الموجودة")}</label>
      {report ? (
        <div className="w-full space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-xs" role="status" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong>{dt("نتيجة الترجمة")}: {report.done.length} / {report.done.length + Object.keys(report.failed).length}</strong>
            <button type="button" className="underline underline-offset-2" onClick={() => setReport(null)}>{dt("إخفاء النتيجة")}</button>
          </div>
          <p className="text-slate-600">{dt("الترجمات الناجحة مسودات غير منشورة. راجع النصوص والتنسيق في كل لغة قبل الحفظ.")}</p>
          {Object.entries(report.failed).map(([code, reason]) => <p key={code} className="text-red-700" role="alert" dir="auto"><bdi>{code.toUpperCase()}</bdi>: {reason}</p>)}
          {Object.entries(report.warnings).map(([code, notes]) => <p key={code} className="text-amber-800" dir="auto"><bdi>{code.toUpperCase()}</bdi>: {notes.join(" · ")}</p>)}
          {Object.keys(report.failed).length ? <button type="button" className="rounded-md border px-3 py-2 font-semibold disabled:opacity-50" disabled={busy} onClick={() => void run(Object.keys(report.failed))}>{dt("إعادة محاولة اللغات المتعثرة")}</button> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Merge helper for forms that keep `{ [locale]: { [field]: string } }`. */
export function mergeTranslations(
  current: Record<string, Record<string, string>>,
  incoming: TranslatedLocales,
  overwrite: boolean,
  fieldNames?: readonly string[]
): Record<string, Record<string, string>> {
  const next: Record<string, Record<string, string>> = { ...current };
  for (const [locale, t] of Object.entries(incoming)) {
    const row = { ...(next[locale] ?? {}) };
    const merged = { ...t.fields, ...t.richFields };
    for (const [field, value] of Object.entries(merged)) {
      if (fieldNames && !fieldNames.includes(field)) continue;
      if (!overwrite && (row[field] ?? '').trim()) continue;
      // Never erase a reviewed translation with an empty/failed model field.
      if (typeof value !== "string" || !value.trim()) continue;
      row[field] = value;
    }
    next[locale] = row;
  }
  return next;
}
