"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Clock3, Download, Edit3, FileSearch, Loader2, Save, Search, Sparkles, Trash2, Upload, X } from "lucide-react";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Button } from "@/components/ui/button";
import { ArchiveFileActivityPanel, type ArchiveFileActivityItem } from "./ArchiveFileActivityPanel";
import { ArchiveReferenceSelects } from "./ArchiveReferenceSelects";
import {
  emptyArchiveRefs,
  fileCategoryOptions,
  formatArchiveBytes,
  formatArchiveDate,
  reviewStatuses,
  statusLabel,
  storageLabel,
  type Category,
  type Feedback,
  type FileAnalysis,
  type ReviewStatus,
  type UploadedFile,
} from "./archiveUploadedFileTypes";
import { uploadArchiveFile } from "./archiveUploadClient";

type Props = {
  category: Category;
  title: string;
  description: string;
};

export function ArchiveUploadedFilesManager({ category, title, description }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [archiveRefs, setArchiveRefs] = useState(emptyArchiveRefs);
  const [fileTitle, setFileTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [linkedCollectionId, setLinkedCollectionId] = useState("");
  const [linkedProjectId, setLinkedProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [activityOpenId, setActivityOpenId] = useState<string | null>(null);
  const [activityLoadingId, setActivityLoadingId] = useState<string | null>(null);
  const [activity, setActivity] = useState<Record<string, ArchiveFileActivityItem[]>>({});
  const [draft, setDraft] = useState({
    title: "",
    notes: "",
    fileCategory: "",
    reviewStatus: "NEW" as ReviewStatus,
    linkedCollectionId: "",
    linkedProjectId: "",
  });
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const categoryOptions = useMemo(() => fileCategoryOptions(category), [category]);
  const filteredFiles = useMemo(() => {
    const term = search.trim().toLowerCase();
    return files.filter((file) => {
      const analysisText = [file.aiAnalysis?.summary, file.aiAnalysis?.suggestedUse, ...(file.aiAnalysis?.keywords ?? [])].join(" ");
      const referenceText = `${file.linkedCollectionName || ""} ${file.linkedProjectName || ""}`;
      const matchesSearch = !term || [file.title, file.fileName, file.notes, file.fileCategory, analysisText, referenceText]
        .some((value) => (value || "").toLowerCase().includes(term));
      const matchesType = typeFilter === "ALL" || file.extension?.toLowerCase() === typeFilter.toLowerCase();
      const matchesCategory = categoryFilter === "ALL" || file.fileCategory === categoryFilter;
      const matchesStatus = statusFilter === "ALL" || file.reviewStatus === statusFilter;
      return matchesSearch && matchesType && matchesCategory && matchesStatus;
    });
  }, [files, search, typeFilter, categoryFilter, statusFilter]);

  async function loadFiles() {
    setLoading(true);
    const response = await fetch(`/api/admin/archive/uploaded-files?category=${category}`, { cache: "no-store" });
    const result = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok || !result?.ok) {
      setFeedback({ tone: "error", message: result?.error || result?.message || "تعذر تحميل الملفات" });
      return;
    }
    setFiles(result.files ?? []);
    setArchiveRefs(result.references ?? emptyArchiveRefs);
  }

  useEffect(() => {
    void loadFiles();
  }, [category]);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file || saving) {
      setFeedback({ tone: "error", message: "اختر ملف PDF أو Excel أولًا." });
      return;
    }

    setSaving(true);
    setProgress(0);
    setFeedback(null);
    try {
      await uploadArchiveFile({
        category,
        title: fileTitle.trim() || file.name,
        notes: notes.trim(),
        file,
        linkedCollectionId,
        linkedProjectId,
        onProgress: setProgress,
      });
      setFeedback({ tone: "success", message: "تم رفع الملف" });
      setFileTitle("");
      setNotes("");
      setLinkedCollectionId("");
      setLinkedProjectId("");
      if (fileRef.current) fileRef.current.value = "";
      await loadFiles();
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "تعذر رفع الملف" });
    } finally {
      setSaving(false);
    }
  }

  function startEdit(file: UploadedFile) {
    setEditingId(file.id);
    setDraft({
      title: file.title,
      notes: file.notes || "",
      fileCategory: file.fileCategory || categoryOptions[0],
      reviewStatus: file.reviewStatus || "NEW",
      linkedCollectionId: file.linkedCollectionId || "",
      linkedProjectId: file.linkedProjectId || "",
    });
    setFeedback(null);
  }

  async function saveEdit(id: string) {
    const response = await fetch(`/api/admin/archive/uploaded-files/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      setFeedback({ tone: "error", message: result?.error || result?.message || "تعذر حفظ التعديل" });
      return;
    }
    setFeedback({ tone: "success", message: "تم حفظ التعديل" });
    setEditingId(null);
    await loadFiles();
  }

  async function analyzeFile(id: string) {
    if (analyzingId) return;
    setAnalyzingId(id);
    setFeedback(null);
    const response = await fetch(`/api/admin/archive/uploaded-files/${id}/analyze`, { method: "POST" });
    const result = await response.json().catch(() => null);
    setAnalyzingId(null);
    if (!response.ok || !result?.ok) {
      setFeedback({ tone: "error", message: result?.error || result?.message || "تعذر تحليل الملف" });
      return;
    }
    setFeedback({ tone: "success", message: "تم تحليل الملف" });
    await loadFiles();
  }

  async function toggleActivity(id: string) {
    if (activityOpenId === id) {
      setActivityOpenId(null);
      return;
    }
    setActivityOpenId(id);
    if (activity[id]) return;
    setActivityLoadingId(id);
    const response = await fetch(`/api/admin/archive/uploaded-files/${id}/activity`, { cache: "no-store" });
    const result = await response.json().catch(() => null);
    setActivityLoadingId(null);
    if (!response.ok || !result?.ok) {
      setFeedback({ tone: "error", message: result?.error || result?.message || "تعذر تحميل سجل النشاط" });
      return;
    }
    setActivity((current) => ({ ...current, [id]: result.activity ?? [] }));
  }

  async function removeFile(id: string) {
    if (!window.confirm("هل تريد حذف هذا الملف؟")) return;
    const response = await fetch(`/api/admin/archive/uploaded-files/${id}`, { method: "DELETE" });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      setFeedback({ tone: "error", message: result?.error || result?.message || "تعذر حذف الملف" });
      return;
    }
    setFeedback({ tone: "success", message: "تم حذف الملف" });
    await loadFiles();
  }

  return (
    <main className="min-h-screen bg-[#FFFDF8] p-4 text-slate-950 sm:p-6" dir="rtl">
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black text-brand">الأرشيف</p>
            <h1 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">{description}</p>
          </div>
          <Link href="/dashboard/archive" className="inline-flex h-9 items-center rounded-md border bg-white px-3 text-sm font-bold text-slate-800 hover:border-brand hover:text-brand">
            الرجوع للأرشيف
          </Link>
        </div>
      </section>

      <section className="mt-4 rounded-xl border bg-white shadow-sm">
        <div className="border-b p-4">
          <h2 className="text-base font-black text-slate-950">رفع ملف جديد</h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">اختر ملف PDF أو Excel من جهازك. يمكنك ربط الملف بمجموعة أو مشروع.</p>
        </div>
        <div className="grid gap-3 p-4 xl:grid-cols-[1fr_1fr_1.5fr_1.4fr_auto]">
          <input value={fileTitle} onChange={(event) => setFileTitle(event.target.value)} placeholder="اسم الملف" className="h-9 rounded-md border px-3 text-sm outline-none focus:border-brand" />
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="ملاحظات" className="h-9 rounded-md border px-3 text-sm outline-none focus:border-brand" />
          <ArchiveReferenceSelects refs={archiveRefs} collectionId={linkedCollectionId} projectId={linkedProjectId} onCollectionChange={setLinkedCollectionId} onProjectChange={setLinkedProjectId} />
          <input ref={fileRef} type="file" accept=".pdf,.xls,.xlsx,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="h-9 rounded-md border bg-white px-2 py-1.5 text-sm file:ml-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs file:font-bold file:text-slate-700" />
          <Button type="button" onClick={upload} disabled={saving} className="h-9 gap-2 font-bold">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {saving ? `${progress}%` : "رفع"}
          </Button>
        </div>
        {saving ? <div className="mx-4 mb-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} /></div> : null}
      </section>

      {feedback ? (
        <p className={`mt-4 rounded-lg border px-4 py-3 text-sm font-bold ${feedback.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {feedback.message}
        </p>
      ) : null}

      <section className="mt-4 rounded-xl border bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-base font-black text-slate-950">الملفات</h2>
            <p className="mt-1 text-xs text-slate-600">إجمالي الملفات: {filteredFiles.length} من {files.length}</p>
          </div>
          <div className="grid gap-2 md:grid-cols-[1.4fr_0.8fr_1fr_1fr] xl:min-w-[720px]">
            <label className="relative block">
              <Search className="absolute right-2 top-2.5 h-4 w-4 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث باسم الملف أو الملاحظات" className="h-9 w-full rounded-md border bg-white pr-8 pl-3 text-sm outline-none focus:border-brand" />
            </label>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-9 rounded-md border bg-white px-2 text-sm outline-none focus:border-brand">
              <option value="ALL">كل الأنواع</option>
              <option value="pdf">PDF</option>
              <option value="xls">XLS</option>
              <option value="xlsx">XLSX</option>
            </select>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="h-9 rounded-md border bg-white px-2 text-sm outline-none focus:border-brand">
              <option value="ALL">كل التصنيفات</option>
              {categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 rounded-md border bg-white px-2 text-sm outline-none focus:border-brand">
              <option value="ALL">كل الحالات</option>
              {reviewStatuses.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto p-4">
          {loading ? (
            <p className="rounded-lg border bg-slate-50 p-4 text-sm text-slate-600">جاري تحميل الملفات...</p>
          ) : filteredFiles.length === 0 ? (
            <EmptyState
              icon={FileSearch}
              title="لا توجد ملفات مطابقة"
              description="لا يوجد ملف يطابق البحث أو التصفية الحالية. جرّب مصطلحًا أوسع أو غيّر التصنيف."
            />
          ) : (
            <table className="w-full min-w-[1320px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="p-3 text-right">اسم الملف</th>
                  <th className="p-3 text-right">النوع</th>
                  <th className="p-3 text-right">التصنيف</th>
                  <th className="p-3 text-right">الحالة</th>
                  <th className="p-3 text-right">مرتبط بـ</th>
                  <th className="p-3 text-right">الحجم</th>
                  <th className="p-3 text-right">التخزين</th>
                  <th className="p-3 text-right">تاريخ الرفع</th>
                  <th className="p-3 text-right">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredFiles.map((file) => {
                  const isEditing = editingId === file.id;
                  const isAnalyzing = analyzingId === file.id;
                  return (
                    <tr key={file.id} className="align-top">
                      <td className="p-3">
                        {isEditing ? (
                          <div className="grid gap-2">
                            <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} className="h-8 rounded-md border px-2 text-xs outline-none focus:border-brand" />
                            <input value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="ملاحظات" className="h-8 rounded-md border px-2 text-xs outline-none focus:border-brand" />
                          </div>
                        ) : (
                          <>
                            <p className="font-black text-slate-950">{file.title}</p>
                            <p className="mt-1 text-xs text-slate-500">{file.fileName}</p>
                            {file.notes ? <p className="mt-1 text-xs text-slate-500">{file.notes}</p> : null}
                            {file.aiAnalysis ? <AnalysisBox analysis={file.aiAnalysis} analyzedAt={file.aiAnalyzedAt} /> : null}
                            {activityOpenId === file.id ? <ArchiveFileActivityPanel items={activity[file.id] || []} loading={activityLoadingId === file.id} /> : null}
                          </>
                        )}
                      </td>
                      <td className="p-3 font-bold text-slate-700">{file.extension?.toUpperCase() || "FILE"}</td>
                      <td className="p-3 text-slate-700">
                        {isEditing ? (
                          <select value={draft.fileCategory} onChange={(event) => setDraft((current) => ({ ...current, fileCategory: event.target.value }))} className="h-8 rounded-md border bg-white px-2 text-xs outline-none focus:border-brand">
                            {categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                          </select>
                        ) : <Badge>{file.fileCategory || "عام"}</Badge>}
                      </td>
                      <td className="p-3 text-slate-700">
                        {isEditing ? (
                          <select value={draft.reviewStatus} onChange={(event) => setDraft((current) => ({ ...current, reviewStatus: event.target.value as ReviewStatus }))} className="h-8 rounded-md border bg-white px-2 text-xs outline-none focus:border-brand">
                            {reviewStatuses.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        ) : <Badge>{statusLabel(file.reviewStatus)}</Badge>}
                      </td>
                      <td className="p-3 text-slate-700">
                        {isEditing ? (
                          <ArchiveReferenceSelects
                            refs={archiveRefs}
                            collectionId={draft.linkedCollectionId}
                            projectId={draft.linkedProjectId}
                            onCollectionChange={(value) => setDraft((current) => ({ ...current, linkedCollectionId: value }))}
                            onProjectChange={(value) => setDraft((current) => ({ ...current, linkedProjectId: value }))}
                            compact
                          />
                        ) : (
                          <div className="space-y-1 text-xs">
                            <p>{file.linkedCollectionName || "بدون مجموعة"}</p>
                            {file.linkedProjectName ? <p className="font-bold text-brand">{file.linkedProjectName}</p> : null}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-slate-700">{formatArchiveBytes(file.sizeBytes)}</td>
                      <td className="p-3 text-slate-700">{storageLabel(file)}</td>
                      <td className="p-3 text-slate-700">{formatArchiveDate(file.createdAt)}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          {isEditing ? (
                            <>
                              <ActionButton onClick={() => void saveEdit(file.id)} icon={<Save className="h-3.5 w-3.5" />} label="حفظ" />
                              <IconButton onClick={() => setEditingId(null)} icon={<X className="h-3.5 w-3.5" />} />
                            </>
                          ) : (
                            <>
                              <ActionButton disabled={Boolean(analyzingId)} onClick={() => void analyzeFile(file.id)} icon={isAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} label="تحليل" />
                              <ActionButton onClick={() => void toggleActivity(file.id)} icon={<Clock3 className="h-3.5 w-3.5" />} label="نشاط" />
                              <ActionButton onClick={() => startEdit(file)} icon={<Edit3 className="h-3.5 w-3.5" />} label="تعديل" />
                              <a href={`/api/admin/archive/uploaded-files/${file.id}/download`} className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-white px-3 text-xs font-bold text-slate-800 hover:border-brand hover:text-brand"><Download className="h-3.5 w-3.5" /> تنزيل</a>
                              <IconButton danger onClick={() => void removeFile(file.id)} icon={<Trash2 className="h-3.5 w-3.5" />} />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}

function ActionButton({ label, icon, onClick, disabled }: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-white px-3 text-xs font-bold text-slate-800 hover:border-brand hover:text-brand disabled:opacity-60">{icon}{label}</button>;
}

function IconButton({ icon, onClick, danger }: { icon: ReactNode; onClick: () => void; danger?: boolean }) {
  return <button type="button" onClick={onClick} className={`inline-flex h-8 w-8 items-center justify-center rounded-md border bg-white ${danger ? "text-rose-700 hover:border-rose-300" : "text-slate-700"}`}>{icon}</button>;
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{children}</span>;
}

function AnalysisBox({ analysis, analyzedAt }: { analysis: FileAnalysis; analyzedAt?: string }) {
  return (
    <div className="mt-3 rounded-lg border bg-slate-50 p-3 text-xs leading-6 text-slate-700">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-white px-2 py-1 font-black text-brand ring-1 ring-slate-200">تحليل الملف</span>
        <span className="rounded-md bg-white px-2 py-1 font-bold text-slate-500 ring-1 ring-slate-200">{analysis.confidence === "ai_assisted" ? "مدعوم بالذكاء" : "اعتمادًا على بيانات الملف"}</span>
        {analyzedAt ? <span className="text-[11px] text-slate-400">{formatArchiveDate(analyzedAt)}</span> : null}
      </div>
      <p className="mt-2 font-semibold text-slate-800">{analysis.summary}</p>
      <p className="mt-1"><span className="font-bold">الاستخدام المقترح:</span> {analysis.suggestedUse}</p>
      {analysis.keywords?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{analysis.keywords.map((keyword) => <span key={keyword} className="rounded bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">{keyword}</span>)}</div> : null}
      {analysis.teamNotes?.length ? <ul className="mt-2 list-disc space-y-1 pr-5">{analysis.teamNotes.map((note) => <li key={note}>{note}</li>)}</ul> : null}
    </div>
  );
}
