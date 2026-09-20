/**
 * One set of rules for a bank-transfer receipt, shared by the donor's upload
 * form and `/api/bank-transfer/[id]/receipt`.
 *
 * Same shape as `image-file-rules.ts` / `document-file-rules.ts`, and for the
 * same reason: the browser refuses instantly with a reason the donor can act
 * on, and the API re-checks so a stale tab or a direct call can't hand it
 * something oversized. A receipt is either a photo / screenshot of the
 * transfer notice or the PDF the bank's app exports, so both are accepted.
 */

/** Cloudinary's free-tier cap is 10 MB for both images and raw files. */
export const MAX_RECEIPT_BYTES = 9 * 1024 * 1024;

export const ALLOWED_RECEIPT_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
export const ALLOWED_RECEIPT_DOCUMENT_MIME = ["application/pdf"] as const;
export const ALLOWED_RECEIPT_MIME = [...ALLOWED_RECEIPT_IMAGE_MIME, ...ALLOWED_RECEIPT_DOCUMENT_MIME] as const;

/** What the file picker offers — extensions as well as types, for phones that report neither reliably. */
export const RECEIPT_ACCEPT_ATTR = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.pdf";

export type ReceiptFileRejection = "type" | "size" | "empty";

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Some browsers report an empty type for HEIC photos and for files dragged in
 * from another app; the extension is the fallback so a valid receipt is not
 * refused for a missing MIME.
 */
export function inferReceiptMime(file: { type?: string; name?: string }): string {
  const type = (file.type ?? "").toLowerCase();
  if (type) return type;
  const ext = (file.name ?? "").toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    case "pdf":
      return "application/pdf";
    default:
      return "";
  }
}

/** Returns why the file is refused, or `null` when it is acceptable. Messages are the caller's. */
export function validateReceiptFile(file: { type?: string; size?: number; name?: string }): ReceiptFileRejection | null {
  const type = inferReceiptMime(file);
  if (!(ALLOWED_RECEIPT_MIME as readonly string[]).includes(type)) return "type";
  const size = file.size ?? 0;
  if (size === 0) return "empty";
  if (size > MAX_RECEIPT_BYTES) return "size";
  return null;
}

export function isReceiptImage(mime: string): boolean {
  return (ALLOWED_RECEIPT_IMAGE_MIME as readonly string[]).includes(mime.toLowerCase());
}
