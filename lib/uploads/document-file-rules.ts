/**
 * One set of document-upload rules shared by the browser and
 * `/api/upload/document`.
 *
 * Mirrors `image-file-rules.ts`, and exists for the same reason: reports and
 * booklets are PDFs, and `/api/upload` hands Cloudinary `resource_type: 'image'`
 * — a PDF posted there is either rejected or silently rasterised. Checking the
 * same limits on both sides lets the browser refuse instantly while keeping the
 * API safe from a stale tab or a direct call.
 */

/** Cloudinary's free-tier raw cap is 10 MB; stay under it deliberately. */
export const MAX_DOCUMENT_BYTES = 9 * 1024 * 1024;

export const ALLOWED_DOCUMENT_MIME = ["application/pdf"] as const;

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Returns an Arabic error message, or `null` when the file is acceptable. */
export function validateDocumentFile(file: { type?: string; size?: number }): string | null {
  const type = (file.type ?? "").toLowerCase();
  if (!(ALLOWED_DOCUMENT_MIME as readonly string[]).includes(type)) {
    return "الملف يجب أن يكون PDF.";
  }
  const size = file.size ?? 0;
  if (size > MAX_DOCUMENT_BYTES) {
    return `حجم الملف ${formatBytes(size)} — الحد الأقصى ${formatBytes(MAX_DOCUMENT_BYTES)}.`;
  }
  return null;
}
