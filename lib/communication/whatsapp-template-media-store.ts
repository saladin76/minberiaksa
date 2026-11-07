import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { del, put } from "@vercel/blob";

/**
 * Template headers need TWO resources:
 *   1. A short-lived Meta upload-session handle for template approval.
 *   2. A durable, unauthenticated HTTPS media link for every actual send.
 *
 * Cloudinary may be unavailable ("cloud_name is disabled"), so the VPS can
 * persist the second resource independently of that provider. The directory
 * must be outside the Git checkout / release worktree and included in backups.
 *
 * URLs have random UUID filenames. The files are public-by-link by design:
 * only upload content intended to be delivered to WhatsApp recipients.
 */
export const LOCAL_TEMPLATE_MEDIA_DIRECTORY = "/var/lib/minberiaksa/whatsapp-template-media";

export const TEMPLATE_MEDIA_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
} as const;

export type TemplateMediaMime = keyof typeof TEMPLATE_MEDIA_TYPES;
export type TemplateMediaStorageMode = "LOCAL" | "BLOB" | "UNAVAILABLE";

export interface StoredWhatsappTemplateMedia {
  id: string;
  url: string;
  mode: Exclude<TemplateMediaStorageMode, "UNAVAILABLE">;
  localFile?: string;
}

const MEDIA_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|mp4|pdf)$/i;
const MEDIA_EXT_TO_MIME: Record<string, TemplateMediaMime> = {
  jpg: "image/jpeg",
  png: "image/png",
  mp4: "video/mp4",
  pdf: "application/pdf",
};

export function validWhatsappTemplateMediaId(id: string): boolean {
  return MEDIA_ID_RE.test(id);
}

export function whatsappTemplateMediaStorageMode(env: NodeJS.ProcessEnv = process.env): TemplateMediaStorageMode {
  if (env.BLOB_READ_WRITE_TOKEN) return "BLOB";
  if (env.VERCEL) return "UNAVAILABLE"; // Serverless disk is not persistent.
  return "LOCAL";
}

function mediaDirectory(env: NodeJS.ProcessEnv = process.env): string {
  const selected = env.WHATSAPP_TEMPLATE_MEDIA_DIR?.trim() || LOCAL_TEMPLATE_MEDIA_DIRECTORY;
  if (!path.isAbsolute(selected)) throw new Error("WHATSAPP_TEMPLATE_MEDIA_DIR must be an absolute path");
  return selected;
}

export function templateMediaPublicUrl(id: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!validWhatsappTemplateMediaId(id)) throw new Error("INVALID_TEMPLATE_MEDIA_ID");
  const configured = env.WHATSAPP_TEMPLATE_MEDIA_PUBLIC_BASE_URL?.trim()
    || env.NEXT_PUBLIC_SITE_URL?.trim()
    || "https://minberiaksa.org";
  const base = new URL(configured);
  if (base.protocol !== "https:" || base.username || base.password) {
    throw new Error("WhatsApp template media must use a public HTTPS origin");
  }
  return `${base.origin}/api/public/whatsapp-template-media/${id}`;
}

export async function storeWhatsappTemplateMedia(
  bytes: Buffer,
  mime: TemplateMediaMime,
  env: NodeJS.ProcessEnv = process.env,
): Promise<StoredWhatsappTemplateMedia> {
  const ext = TEMPLATE_MEDIA_TYPES[mime];
  if (!ext || !bytes.length) throw new Error("INVALID_TEMPLATE_MEDIA");
  const id = `${randomUUID()}.${ext}`;
  const mode = whatsappTemplateMediaStorageMode(env);
  if (mode === "UNAVAILABLE") {
    throw new Error("No persistent WhatsApp media store is configured. Configure BLOB_READ_WRITE_TOKEN on serverless hosting.");
  }

  if (mode === "BLOB") {
    const stored = await put(`whatsapp-template-media/${id}`, bytes, {
      access: "public",
      contentType: mime,
      addRandomSuffix: true,
      token: env.BLOB_READ_WRITE_TOKEN,
    });
    return { id, url: stored.url, mode: "BLOB" };
  }

  const url = templateMediaPublicUrl(id, env); // Validate public origin before writing anything.
  const targetDir = mediaDirectory(env);
  await mkdir(targetDir, { recursive: true, mode: 0o750 });
  const filename = path.join(targetDir, id);
  await writeFile(filename, bytes, { flag: "wx", mode: 0o640 });
  return { id, url, mode: "LOCAL", localFile: filename };
}

export async function removeWhatsappTemplateMedia(media: StoredWhatsappTemplateMedia) {
  if (media.mode === "BLOB") return del(media.url).catch(() => undefined);
  if (media.localFile) return unlink(media.localFile).catch(() => undefined);
}

export async function openLocalWhatsappTemplateMedia(id: string): Promise<{
  body: ReadableStream<Uint8Array>;
  type: TemplateMediaMime;
  bytes: number;
} | null> {
  if (!validWhatsappTemplateMediaId(id)) return null;
  const filePath = path.join(mediaDirectory(), id);
  try {
    const file = await stat(filePath);
    if (!file.isFile()) return null;
    const ext = id.slice(id.lastIndexOf(".") + 1).toLowerCase();
    const type = MEDIA_EXT_TO_MIME[ext];
    if (!type) return null;
    // File contents are streamed; a 100MB PDF must not be loaded into RAM
    // a second time just to serve Meta's download request.
    return {
      body: Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>,
      type,
      bytes: file.size,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
