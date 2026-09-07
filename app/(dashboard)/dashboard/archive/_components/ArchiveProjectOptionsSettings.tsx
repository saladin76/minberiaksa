"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, Save, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFAULT_ARCHIVE_PROJECT_OPTIONS, saveArchiveProjectOptions, useArchiveProjectOptions, type ArchiveProjectOptions } from "./archiveProjectOptions";

type OptionKey = keyof ArchiveProjectOptions;
type Feedback = { tone: "success" | "error"; message: string } | null;

const fields: { key: OptionKey; title: string; hint: string }[] = [
  { key: "years", title: "السنوات", hint: "كل سنة في سطر منفصل." },
  { key: "countries", title: "البلاد", hint: "البلاد المتاحة عند إضافة مشروع." },
  { key: "cities", title: "المدن", hint: "المدن أو المناطق المستخدمة كثيرًا." },
  { key: "themes", title: "التصنيفات", hint: "مثل مياه، طرود، كفالات، زكاة." },
  { key: "projectTypes", title: "أنواع المشاريع", hint: "مثل إغاثة طارئة أو مشروع موسمي." },
];

export function ArchiveProjectOptionsSettings() {
  const options = useArchiveProjectOptions();
  const [draft, setDraft] = useState<ArchiveProjectOptions>(options);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    setDraft(options);
  }, [options]);

  const summary = useMemo(() => fields.map((field) => ({ ...field, count: draft[field.key].length })), [draft]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await saveArchiveProjectOptions(draft);
      setDraft(saved);
      setFeedback({ tone: "success", message: "تم حفظ إعدادات خيارات المشاريع." });
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "تعذر حفظ الإعدادات" });
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setDraft(DEFAULT_ARCHIVE_PROJECT_OPTIONS);
    setFeedback(null);
  }

  return (
    <main className="min-h-screen bg-[#FFFDF8] p-4 text-slate-950 sm:p-6" dir="rtl">
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black text-brand">الأرشيف</p>
            <h1 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight">إعدادات خيارات المشاريع</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
              هنا يتم تنظيم القوائم التي تظهر عند إضافة أو تعديل مشروع داخل الأرشيف، مثل السنوات والمدن والتصنيفات.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/archive" className="inline-flex h-9 items-center rounded-md border bg-white px-3 text-sm font-bold text-slate-800 hover:border-brand hover:text-brand">
              الرجوع للأرشيف
            </Link>
            <Button type="button" variant="outline" onClick={reset} disabled={saving} className="h-9 gap-2 font-bold">
              <RotateCcw className="h-4 w-4" /> استرجاع الافتراضي
            </Button>
            <Button type="button" onClick={save} disabled={saving} className="h-9 gap-2 font-bold">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              حفظ الإعدادات
            </Button>
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {summary.map((item) => (
          <div key={item.key} className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-500">{item.title}</p>
                <p className="mt-1 text-2xl font-black text-slate-950">{item.count}</p>
              </div>
              <Settings2 className="h-5 w-5 text-brand" />
            </div>
          </div>
        ))}
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        {fields.map((field) => (
          <label key={field.key} className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-slate-950">{field.title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{field.hint}</p>
              </div>
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{draft[field.key].length}</span>
            </div>
            <textarea
              value={draft[field.key].join("\n")}
              onChange={(event) => setDraft((current) => ({ ...current, [field.key]: splitLines(event.target.value) }))}
              className="mt-3 min-h-40 w-full rounded-lg border bg-slate-50 px-3 py-2 text-sm leading-7 text-slate-900 outline-none focus:border-brand"
            />
          </label>
        ))}
      </section>

      {feedback ? (
        <p className={`mt-4 rounded-lg border px-4 py-3 text-sm font-bold ${feedback.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {feedback.message}
        </p>
      ) : null}
    </main>
  );
}

function splitLines(value: string) {
  return Array.from(new Set(value.split(/\n|,/).map((item) => item.trim()).filter(Boolean)));
}
