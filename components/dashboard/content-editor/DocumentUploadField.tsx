"use client";
import { useState } from "react";
import { dt } from "@/lib/dashboard/i18n";
import { validateDocumentFile } from "@/lib/uploads/document-file-rules";

export function DocumentUploadField({ value, onChange, onUploadingChange, disabled = false }: {
  value: string; onChange: (url: string) => void; onUploadingChange?: (uploading: boolean) => void; disabled?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  return <div className="space-y-2">
    <input aria-label={dt("رابط الملف")} dir="ltr" type="url" value={value} disabled={disabled || uploading}
      className="w-full rounded-lg border p-3 text-sm" onChange={(event) => onChange(event.target.value)} />
    <label className="inline-flex cursor-pointer rounded border px-3 py-2 text-sm">
      {uploading ? dt("جارٍ رفع الملف…") : dt("رفع ملف PDF")}
      <input type="file" accept="application/pdf" className="sr-only" disabled={disabled || uploading} onChange={async (event) => {
        const input = event.currentTarget, file = input.files?.[0]; if (!file) return;
        const rejection = validateDocumentFile(file);
        if (rejection) { setError(dt(rejection)); input.value = ""; return; }
        setError(""); setUploading(true); onUploadingChange?.(true);
        try {
          const form = new FormData(); form.append("file", file);
          const response = await fetch("/api/upload/document", { method: "POST", body: form });
          const data = await response.json();
          if (!response.ok || typeof data.url !== "string") throw new Error(data.error || dt("تعذّر رفع الملف"));
          onChange(data.url);
        } catch (failure) { setError(failure instanceof Error ? failure.message : dt("تعذّر رفع الملف")); }
        finally { input.value = ""; setUploading(false); onUploadingChange?.(false); }
      }} />
    </label>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
  </div>;
}
