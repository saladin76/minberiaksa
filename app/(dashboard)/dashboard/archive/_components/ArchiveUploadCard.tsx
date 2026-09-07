"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { FileUp, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadArchiveFile } from "./archiveUploadClient";

type Category = "MARKETING" | "DOCUMENTS";

type Props = {
  category: Category;
  title: string;
  description: string;
  openHref: string;
};

export function ArchiveUploadCard({ category, title, description, openHref }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [fileTitle, setFileTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error">("success");

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file || saving) {
      setTone("error");
      setMessage("اختر ملف PDF أو Excel أولًا.");
      return;
    }

    setSaving(true);
    setProgress(0);
    setMessage(null);
    try {
      await uploadArchiveFile({ category, title: fileTitle.trim() || file.name, file, onProgress: setProgress });
      setTone("success");
      setMessage("تم رفع الملف داخل الأرشيف.");
      setFileTitle("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (error) {
      setTone("error");
      setMessage(error instanceof Error ? error.message : "تعذر رفع الملف");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-slate-950">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
        <FileUp className="h-4 w-4 text-brand" />
      </div>

      <div className="mt-3 grid gap-2">
        <input value={fileTitle} onChange={(event) => setFileTitle(event.target.value)} placeholder="اسم الملف" className="h-8 rounded-md border px-2 text-xs outline-none focus:border-brand" />
        <input ref={fileRef} type="file" accept=".pdf,.xls,.xlsx,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="h-8 rounded-md border bg-white px-2 py-1 text-xs file:ml-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs file:font-bold file:text-slate-700" />
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button type="button" size="sm" onClick={upload} disabled={saving} className="h-8 gap-2 text-xs font-bold">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {saving ? `${progress}%` : "رفع"}
          </Button>
          <Link href={openHref} className="inline-flex h-8 items-center justify-center rounded-md border bg-white px-3 text-xs font-bold text-slate-800 transition hover:border-brand hover:text-brand">
            فتح
          </Link>
        </div>
        {saving ? <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} /></div> : null}
        {message ? (
          <p className={`rounded-md border px-2 py-1.5 text-[11px] font-bold ${tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
