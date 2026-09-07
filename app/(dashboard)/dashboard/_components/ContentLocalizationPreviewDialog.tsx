"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { AlertTriangle, Info, Loader2, Save, Sparkles, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "react-hot-toast";
import { errorMessage } from "@/lib/dashboard/client-error-message";

const LOCALE_LABELS: Record<string, string> = {
  ar: "العربية",
  en: "الإنجليزية",
  fr: "الفرنسية",
  tr: "التركية",
  id: "الإندونيسية",
  pt: "البرتغالية",
  es: "الإسبانية",
  de: "الألمانية",
};

const FIELD_LABELS: Record<string, string> = {
  title: "العنوان",
  name: "الاسم",
  description: "الوصف",
  content: "المحتوى",
  buttonText: "نص الزر",
};

type Section = "campaigns" | "categories" | "blog" | "slides";

type RowType = "campaign" | "category" | "post" | "postCategory" | "slide";

type PreviewRow = {
  id: string;
  type: RowType;
  label: string;
  typeLabel: string;
  locale: string;
  sourceArabic: Record<string, string | null>;
  currentTranslation: Record<string, string | null>;
  suggestedTranslation: Record<string, string>;
  missingFields: string[];
  emptyFields: string[];
  identicalToArabicFields: string[];
  qualityNotes?: string[];
};

/** Mirrors APPLY_FIELDS on the API — anything outside this list is display-only.
 *  The article body (`content`) is rich text and can only be shown flattened
 *  here, so it stays read-only rather than being saved back as plain text. */
const EDITABLE_FIELDS: Record<RowType, readonly string[]> = {
  campaign: ["title", "description"],
  category: ["name", "description"],
  post: ["title", "description"],
  postCategory: ["name", "title", "description"],
  slide: ["title", "description", "buttonText"],
};

function plainText(value: string | null | undefined): string {
  const raw = value?.trim() || "";
  if (!raw) return "";
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      const walk = (node: unknown): string => {
        if (!node) return "";
        if (typeof node === "string") return node;
        if (Array.isArray(node)) return node.map(walk).filter(Boolean).join(" ");
        if (typeof node !== "object") return "";
        const item = node as { text?: unknown; content?: unknown };
        return [typeof item.text === "string" ? item.text : "", walk(item.content)]
          .filter(Boolean)
          .join(" ");
      };
      return walk(parsed).replace(/\s+/g, " ").trim();
    } catch {
      // Continue with HTML/plain text cleanup.
    }
  }
  return raw.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function rowKey(row: PreviewRow): string {
  return `${row.type}-${row.id}`;
}

function editableFieldsFor(row: PreviewRow): string[] {
  return EDITABLE_FIELDS[row.type].filter((field) => field in row.sourceArabic);
}

function draftFor(row: PreviewRow): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const field of editableFieldsFor(row)) {
    fields[field] = plainText(
      row.suggestedTranslation[field] || row.currentTranslation[field],
    );
  }
  return fields;
}

export function ContentLocalizationPreviewDialog({
  section,
  open,
  onOpenChange,
  defaultLocale = "de",
  onSaved,
}: {
  section: Section;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultLocale?: string;
  onSaved?: () => void;
}) {
  const [locale, setLocale] = useState(defaultLocale);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  function adoptRows(nextRows: PreviewRow[]) {
    setRows(nextRows);
    setDrafts(Object.fromEntries(nextRows.map((row) => [rowKey(row), draftFor(row)])));
  }

  async function loadRows() {
    setLoading(true);
    try {
      const response = await axios.get("/api/admin/content-localization/preview", {
        params: { section, locale, limit: 10 },
      });
      adoptRows(response.data?.rows || []);
    } catch (error) {
      toast.error(errorMessage(error, "تعذر تجهيز المعاينة"));
    } finally {
      setLoading(false);
    }
  }

  async function generatePreview() {
    setGenerating(true);
    try {
      const response = await axios.post("/api/admin/content-localization/preview", {
        action: "generate",
        section,
        locale,
        limit: 8,
      });
      adoptRows(response.data?.rows || []);
      toast.success("تم تجهيز الاقتراحات — راجعها ثم اضغط حفظ");
    } catch (error) {
      toast.error(errorMessage(error, "تعذر توليد المعاينة"));
    } finally {
      setGenerating(false);
    }
  }

  /** A field counts as changed when the draft differs from what is stored now. */
  function changedFields(row: PreviewRow): Record<string, string> {
    const draft = drafts[rowKey(row)] || {};
    const changed: Record<string, string> = {};
    for (const field of editableFieldsFor(row)) {
      const next = (draft[field] || "").trim();
      if (!next) continue;
      if (next === plainText(row.currentTranslation[field])) continue;
      changed[field] = next;
    }
    return changed;
  }

  async function saveRows(targets: PreviewRow[], key: string) {
    const items = targets
      .map((row) => ({ id: row.id, type: row.type, fields: changedFields(row) }))
      .filter((item) => Object.keys(item.fields).length > 0);

    if (items.length === 0) {
      toast("لا توجد تغييرات للحفظ");
      return;
    }

    setSavingKey(key);
    try {
      const response = await axios.post("/api/admin/content-localization/preview", {
        action: "apply",
        section,
        locale,
        items,
      });
      adoptRows(response.data?.rows || []);
      toast.success(`تم حفظ ${response.data?.applied ?? items.length} عنصر في ${LOCALE_LABELS[locale]}`);
      onSaved?.();
    } catch (error) {
      toast.error(errorMessage(error, "تعذر حفظ التعديلات"));
    } finally {
      setSavingKey(null);
    }
  }

  useEffect(() => {
    if (open) void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, locale, section]);

  const busy = loading || generating;
  const saving = savingKey !== null;
  const dirtyRows = rows.filter((row) => Object.keys(changedFields(row)).length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand" />
            مراجعة النصوص والترجمات
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-bold">التعديلات تُحفظ مباشرة</p>
              <p className="mt-1 leading-6">
                عدّل النص المقترح ثم اضغط حفظ ليُخزَّن في لغة {LOCALE_LABELS[locale]}. اختيار
                العربية يعني التعديل على النص الأصلي نفسه. محتوى المقالات المنسّق يُعرض للقراءة
                فقط ويُحرَّر من محرر المقال.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Select value={locale} onValueChange={setLocale}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(LOCALE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={loadRows} disabled={busy || saving}>
              {loading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
              تحديث المعاينة
            </Button>
            <Button
              variant="outline"
              onClick={generatePreview}
              disabled={busy || saving}
              className="gap-2 border-purple-300 text-purple-700 hover:bg-purple-50"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
              توليد ترجمة احترافية
            </Button>
            <Button
              onClick={() => saveRows(dirtyRows, "__all__")}
              disabled={busy || saving || dirtyRows.length === 0}
              className="gap-2"
            >
              {savingKey === "__all__" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              حفظ الكل ({dirtyRows.length})
            </Button>
          </div>
        </div>

        {busy ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="ml-2 h-5 w-5 animate-spin" />
            جاري تجهيز المعاينة…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border bg-emerald-50 p-6 text-center text-emerald-700">
            لا توجد عناصر ناقصة في هذه الدفعة.
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map((row) => {
              const key = rowKey(row);
              const draft = drafts[key] || {};
              const editable = editableFieldsFor(row);
              const rowDirty = Object.keys(changedFields(row)).length > 0;

              return (
                <article key={key} className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-semibold">{row.label}</h3>
                      <p className="text-xs text-muted-foreground">{row.typeLabel} · {LOCALE_LABELS[locale]}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {(row.missingFields.length > 0 || row.emptyFields.length > 0 || row.identicalToArabicFields.length > 0) && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                          <AlertTriangle className="h-3.5 w-3.5" /> يحتاج مراجعة
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() => saveRows([row], key)}
                        disabled={saving || !rowDirty}
                      >
                        {savingKey === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        حفظ
                      </Button>
                    </div>
                  </div>

                  {row.qualityNotes?.length ? (
                    <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800">
                      {row.qualityNotes.slice(0, 4).map((note) => <p key={note}>• {note}</p>)}
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    {Object.keys(row.sourceArabic).map((field) => {
                      const isEditable = editable.includes(field);
                      return (
                        <div key={field} className="grid gap-2 lg:grid-cols-2">
                          <div className="rounded-lg border bg-slate-50 p-3">
                            <p className="mb-1 text-xs font-medium text-muted-foreground">العربي الأصلي · {FIELD_LABELS[field] || field}</p>
                            <p className="whitespace-pre-wrap text-sm leading-7">{plainText(row.sourceArabic[field]) || "—"}</p>
                          </div>
                          <div className="rounded-lg border bg-white p-3">
                            <p className="mb-1 text-xs font-medium text-muted-foreground">
                              {isEditable ? "النص المحفوظ · " : "للقراءة فقط · "}{FIELD_LABELS[field] || field}
                            </p>
                            {isEditable ? (
                              <textarea
                                value={draft[field] ?? ""}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setDrafts((previous) => ({
                                    ...previous,
                                    [key]: { ...(previous[key] || {}), [field]: value },
                                  }));
                                }}
                                dir={locale === "ar" ? "rtl" : "ltr"}
                                rows={field === "title" || field === "name" ? 2 : 5}
                                className="w-full resize-y rounded-md border border-slate-200 bg-white p-2 text-sm leading-7 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                              />
                            ) : (
                              <p className="whitespace-pre-wrap text-sm leading-7" dir={locale === "ar" ? "rtl" : "ltr"}>
                                {plainText(row.suggestedTranslation[field]) || "—"}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
