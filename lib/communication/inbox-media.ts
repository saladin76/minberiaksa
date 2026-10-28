/** Cloud API media types; file names and MIME labels are never used as executable input. */
export type InboxMediaKind = "image" | "video" | "audio" | "document";
const DOCUMENTS = new Set(["application/pdf", "text/plain", "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.presentationml.presentation"]);
export function inboxMediaSpec(mime: string, bytes: number, voice = false): { kind: InboxMediaKind; mime: string; maximum: number } | null {
  const type = mime.split(";")[0].trim().toLowerCase();
  const kind: InboxMediaKind | null = voice && ["audio/webm", "video/webm", "audio/ogg", "audio/mp4"].includes(type) ? "audio" : ["image/jpeg", "image/png"].includes(type) ? "image" : ["video/mp4", "video/3gpp"].includes(type) ? "video" : ["audio/aac", "audio/amr", "audio/mpeg", "audio/mp4", "audio/ogg"].includes(type) ? "audio" : DOCUMENTS.has(type) ? "document" : null;
  const maximum = (kind === "image" ? 5 : kind === "document" ? 100 : 16) * 1024 * 1024;
  return kind && Number.isSafeInteger(bytes) && bytes > 0 && bytes <= maximum ? { kind, mime: type, maximum } : null;
}
export function inboxMediaFilename(value: string) { return value.replace(/[\\/\u0000-\u001f\u007f]/g, "_").slice(0, 100) || "attachment"; }
export function trustedMetaMediaUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.port && (url.hostname === "lookaside.fbsbx.com" || url.hostname.endsWith(".fbcdn.net")) ? url : null; } catch { return null; }
}
