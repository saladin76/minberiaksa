"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { Edit3, Loader2, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ArchiveDriveLink, ArchiveProject } from "@/lib/archive/archive-types";

type Props = {
  link: ArchiveDriveLink;
  projects: ArchiveProject[];
};

type Feedback = { tone: "success" | "error"; message: string } | null;

export function ArchiveDriveLinkManageActions({ link, projects }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [projectId, setProjectId] = useState(link.projectId || projects[0]?.id || "");
  const [title, setTitle] = useState(link.title);
  const [driveUrl, setDriveUrl] = useState(link.driveUrl);

  async function saveChanges() {
    if (busy || !projectId || !title.trim() || !driveUrl.trim()) return;
    setBusy(true);
    setFeedback(null);
    const response = await fetch("/api/admin/archive/drive-links", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: link.id, projectId, title: title.trim(), driveUrl: driveUrl.trim() }),
    });
    const result = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok || !result?.ok) {
      setFeedback({ tone: "error", message: result?.error || result?.message || "تعذر حفظ التعديلات" });
      return;
    }
    setFeedback({ tone: "success", message: result?.message || "تم حفظ التعديلات" });
    setEditing(false);
    router.refresh();
  }

  async function removeItem() {
    if (busy || !window.confirm("هل تريد حذف هذا الرابط؟")) return;
    setBusy(true);
    setFeedback(null);
    const response = await fetch("/api/admin/archive/drive-links", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: link.id }),
    });
    const result = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok || !result?.ok) {
      setFeedback({ tone: "error", message: result?.error || result?.message || "تعذر تنفيذ الإجراء" });
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-3 rounded-lg border bg-white p-3">
      {editing ? (
        <div className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-[1fr_1.1fr]">
            <Field label="المشروع">
              <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="h-9 rounded-md border px-3 text-sm outline-none focus:border-brand">
                {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
              </select>
            </Field>
            <Field label="اسم الرابط">
              <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-9 rounded-md border px-3 text-sm outline-none focus:border-brand" />
            </Field>
          </div>
          <Field label="رابط الملف">
            <input dir="ltr" value={driveUrl} onChange={(event) => setDriveUrl(event.target.value)} className="h-9 rounded-md border px-3 text-left font-mono text-sm outline-none focus:border-brand" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={saveChanges} disabled={busy} className="gap-2 font-bold">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              حفظ
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)} disabled={busy} className="gap-2 font-bold">
              <X className="h-4 w-4" /> إلغاء
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)} className="gap-2 font-bold"><Edit3 className="h-4 w-4" /> تعديل</Button>
          <Button type="button" size="sm" variant="outline" onClick={removeItem} disabled={busy} className="gap-2 font-bold text-rose-700"><Trash2 className="h-4 w-4" /> حذف</Button>
        </div>
      )}
      {feedback ? <p className={`mt-3 rounded-md border px-3 py-2 text-xs font-semibold ${feedback.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{feedback.message}</p> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1 text-xs font-bold text-slate-600">{label}{children}</label>;
}
