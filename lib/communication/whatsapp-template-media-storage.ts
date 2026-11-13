import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";

/**
 * Public, non-personal template-header assets only. These are used as actual
 * media links when Meta sends an approved WhatsApp template (the upload-session
 * header_handle alone is NOT a durable sendable media URL).
 *
 * Store outside the deployment/worktree so a new build does not delete assets.
 * Back up WHATSAPP_TEMPLATE_MEDIA_DIR together with the app's content assets.
 */
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
};
const EXTENSION_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_EXTENSIONS).map(([mime, extension]) => [extension, mime]),
);
const SAFE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|mp4|pdf)$/i;

export type PublicTemplateMedia = { publicId: string; url: string };
export function templateMediaStorageConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_TEMPLATE_MEDIA_DIR?.trim() && process.env.WHATSAPP_TEMPLATE_MEDIA_PUBLIC_ORIGIN?.trim());
}
export function templateMediaFileNameIsSafe(name: string): boolean {
  return SAFE_NAME.test(name);
}
export function templateMediaMime(name: string): string | null {
  return templateMediaFileNameIsSafe(name) ? EXTENSION_MIME[name.split(".").pop()?.toLowerCase() ?? ""] ?? null : null;
}
export function templateMediaDirectory(): string {
  const configured = process.env.WHATSAPP_TEMPLATE_MEDIA_DIR?.trim();
  if (!configured || !isAbsolute(configured)) throw new Error("WHATSAPP_TEMPLATE_MEDIA_DIR must be an absolute persistent VPS directory");
  const directory = resolve(configured);
  const deploymentRoot = resolve(process.cwd());
  if (directory === deploymentRoot || directory.startsWith(deploymentRoot + sep)) {
    throw new Error("WHATSAPP_TEMPLATE_MEDIA_DIR must be outside the deployment directory");
  }
  return directory;
}
function publicOrigin(): string {
  const configured = process.env.WHATSAPP_TEMPLATE_MEDIA_PUBLIC_ORIGIN?.trim();
  if (!configured) throw new Error("WHATSAPP_TEMPLATE_MEDIA_PUBLIC_ORIGIN is not configured");
  const url = new URL(configured);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || url.port) {
    throw new Error("WHATSAPP_TEMPLATE_MEDIA_PUBLIC_ORIGIN must be a public HTTPS origin without a path");
  }
  return url.origin;
}
export function templateMediaAbsolutePath(name: string): string | null {
  return templateMediaFileNameIsSafe(name) ? join(templateMediaDirectory(), name) : null;
}

export async function storePublicTemplateMedia(bytes: Buffer, mime: string): Promise<PublicTemplateMedia> {
  const extension = MIME_EXTENSIONS[mime];
  if (!extension || bytes.length === 0) throw new Error("UNSUPPORTED_TEMPLATE_MEDIA");
  // Validate configuration BEFORE creating any disk file.
  const directory = templateMediaDirectory();
  const origin = publicOrigin();
  await mkdir(directory, { recursive: true, mode: 0o750 });
  const publicId = randomUUID() + "." + extension;
  await writeFile(join(directory, publicId), bytes, { flag: "wx", mode: 0o640 });
  return {
    publicId,
    url: origin + "/api/templates/whatsapp/media-public/" + publicId,
  };
}
export async function discardPublicTemplateMedia(name: string): Promise<void> {
  const path = templateMediaAbsolutePath(name);
  if (path) await unlink(path).catch(() => undefined);
}
