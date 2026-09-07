"use client";

import * as React from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Pencil, Trash2, RefreshCw, Layers, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { segmentSms } from "@/lib/communication/sms-segments";
import { mergeText } from "@/lib/templates/variables";
import { SAMPLE_TEMPLATE_CONTEXT } from "@/lib/templates/sample-context";
import { SUPPORTED_LOCALES, LOCALE_LABELS, DEFAULT_LOCALE, type SupportedLocale } from "@/lib/locales";
import { SmsTemplateEditorDialog } from "./SmsTemplateEditorDialog";

interface SmsTemplateRow {
  id: string;
  name: string;
  body: string;
  translations: Partial<Record<string, { body?: string }>> | null;
  kind: string | null;
  status: string | null;
  purpose: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_PILL: Record<string, { label: string; className: string }> = {
  READY: { label: "جاهز", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  DRAFT: { label: "مسودة", className: "border-slate-200 bg-slate-50 text-slate-600" },
  NEEDS_REVIEW: { label: "بحاجة لمراجعة", className: "border-amber-200 bg-amber-50 text-amber-700" },
  ARCHIVED: { label: "مؤرشف", className: "border-slate-200 bg-slate-100 text-slate-500" },
};

/** Locales this template actually carries a body for — the canonical Arabic plus any override. */
function localesOf(row: SmsTemplateRow): SupportedLocale[] {
  const set = new Set<SupportedLocale>([DEFAULT_LOCALE]);
  for (const [loc, v] of Object.entries(row.translations ?? {})) {
    if (v?.body && SUPPORTED_LOCALES.includes(loc as SupportedLocale)) set.add(loc as SupportedLocale);
  }
  return [...set];
}

export function SmsTemplateList() {
  const [templates, setTemplates] = React.useState<SmsTemplateRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editor, setEditor] = React.useState<{ open: boolean; id: string | null }>({ open: false, id: null });

  const fetchAll = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/templates/sms");
      setTemplates(res.data?.templates ?? []);
    } catch {
      toast.error("فشل في تحميل القوالب");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`هل تريد حذف القالب «${name}»؟`)) return;
    try {
      await axios.delete(`/api/templates/sms/${id}`);
      toast.success("تم الحذف");
      fetchAll();
    } catch {
      toast.error("فشل الحذف");
    }
  };

  // Segment totals are computed on the merged preview for the same reason the editor does it:
  // the raw `{{token}}` length is not what anyone is billed for.
  const totalSegments = templates.reduce(
    (sum, t) => sum + segmentSms(mergeText(t.body, SAMPLE_TEMPLATE_CONTEXT)).segments,
    0,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">
            {loading ? "…" : `${templates.length} قالب رسالة نصية`}
          </p>
          {!loading && templates.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
              <Layers className="h-3 w-3" />
              {totalSegments} مقطع إجمالًا
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={fetchAll} disabled={loading} className="gap-2">
            <RefreshCw className="h-4 w-4" /> تحديث
          </Button>
          <Button size="sm" onClick={() => setEditor({ open: true, id: null })} className="gap-2">
            <Plus className="h-4 w-4" /> قالب جديد
          </Button>
        </div>
      </div>

      {/* Stated once, here, rather than repeated on every row: it is the single fact that makes
          SMS authoring different from the other two channels. */}
      <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <b>الرسائل النصية تُحاسب بالمقطع، لا بالرسالة.</b> النص العربي خارج أبجدية GSM، فيصبح
          المقطع ٧٠ حرفًا بدل ١٦٠ — رسالة من ٩٠ حرفًا عربيًا تُحتسب مقطعين. المحرّر يعرض عدد
          المقاطع أثناء الكتابة.
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-right text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-700">
              <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">الاسم</th>
              <th className="w-full max-w-0 px-4 py-3 text-right font-semibold">المحتوى</th>
              <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">المقاطع</th>
              <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">اللغات</th>
              <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">الحالة</th>
              <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">آخر تحديث</th>
              <th className="w-px px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
                </td>
              </tr>
            ) : templates.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-500">
                  لا توجد قوالب رسائل نصية بعد — اضغط «قالب جديد» للبدء
                </td>
              </tr>
            ) : (
              templates.map((t) => {
                const rendered = mergeText(t.body, SAMPLE_TEMPLATE_CONTEXT);
                const seg = segmentSms(rendered);
                const statusPill = STATUS_PILL[t.status ?? "DRAFT"] ?? STATUS_PILL.DRAFT;
                const locales = localesOf(t);
                return (
                  <tr key={t.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-4 py-3 align-middle">
                      <span className="font-medium text-slate-900">{t.name}</span>
                      {t.kind === "SYSTEM" && (
                        <span className="ms-1.5 inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-700">
                          نظامي
                        </span>
                      )}
                    </td>
                    <td className="max-w-0 px-4 py-3 align-middle">
                      <span className="block truncate text-xs text-slate-600" title={rendered}>
                        {rendered || "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-middle">
                      <span
                        title={`${seg.units} حرفًا · ${seg.encoding === "UCS2" ? "يونيكود (٧٠ للمقطع)" : "GSM (١٦٠ للمقطع)"}`}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                          seg.segments <= 1
                            ? "border-slate-200 bg-slate-50 text-slate-600"
                            : seg.segments === 2
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-rose-200 bg-rose-50 text-rose-700",
                        )}
                      >
                        <Layers className="h-3 w-3" />
                        {seg.segments}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-middle">
                      <div className="flex flex-wrap gap-1">
                        {locales.map((loc) => (
                          <span
                            key={loc}
                            className="inline-flex items-center rounded border border-border bg-white px-1.5 py-0.5 text-[10px] text-slate-600"
                          >
                            {LOCALE_LABELS[loc]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-middle">
                      <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px]", statusPill.className)}>
                        {statusPill.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-middle text-xs text-slate-500">
                      {new Date(t.updatedAt).toLocaleDateString("ar-EG", { dateStyle: "medium" })}
                    </td>
                    <td className="w-px whitespace-nowrap px-4 py-3 align-middle">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 px-2 text-xs"
                          onClick={() => setEditor({ open: true, id: t.id })}
                        >
                          <Pencil className="h-3.5 w-3.5" /> تعديل
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
                          onClick={() => handleDelete(t.id, t.name)}
                          title="حذف"
                          aria-label="حذف"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <SmsTemplateEditorDialog
        id={editor.id}
        open={editor.open}
        onOpenChange={(open) => setEditor((prev) => ({ ...prev, open }))}
        onSaved={fetchAll}
      />
    </div>
  );
}
