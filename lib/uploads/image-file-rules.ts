/**
 * One set of image-upload rules shared by the browser and `/api/upload`.
 *
 * The upload route previously accepted any file of any size, buffered it whole
 * and base64-encoded it (a ~1.37× blow-up) before handing it to Cloudinary. A
 * large hero photo therefore either timed out or came back as a bare
 * "Internal error" with no indication of what went wrong. Checking the same
 * limits on both sides means the browser can refuse instantly and the server
 * still can't be handed something oversized.
 */

/** Cloudinary's free-tier image cap is 10 MB; stay under it deliberately. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
] as const;

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Returns an Arabic error message, or `null` when the file is acceptable. */
export function validateImageFile(file: { type?: string; size?: number }): string | null {
  const type = (file.type ?? "").toLowerCase();
  if (!type.startsWith("image/")) {
    return "الملف المختار ليس صورة.";
  }
  if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(type)) {
    return "صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WEBP.";
  }
  const size = file.size ?? 0;
  if (size > MAX_IMAGE_BYTES) {
    return `حجم الصورة ${formatBytes(size)} — الحد الأقصى ${formatBytes(MAX_IMAGE_BYTES)}. اضغط الصورة وحاول مجددًا.`;
  }
  if (size === 0) {
    return "الملف فارغ.";
  }
  return null;
}
