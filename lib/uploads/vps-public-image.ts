import { randomUUID } from "node:crypto";
import { mkdir, statfs, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";

/** Opaque image names, not user-supplied titles, paths, or filenames. */
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};
const EXT_MIME = Object.fromEntries(Object.entries(MIME_EXT).map(([mime, ext]) => [ext, mime])) as Record<string, string>;
const ID = /^vps-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function publicImageStorageEnabled(): boolean {
  return Boolean(process.env.MINBAR_PUBLIC_IMAGE_DIR?.trim() && process.env.MINBAR_PUBLIC_IMAGE_ORIGIN?.trim());
}
export function isVpsImageId(value: string): boolean { return ID.test(value); }
export function imageMediaType(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  if (dot === -1 || !isVpsImageId(filename.slice(0, dot))) return null;
  return EXT_MIME[filename.slice(dot + 1).toLowerCase()] ?? null;
}
export function imageDirectory(): string {
  const value = process.env.MINBAR_PUBLIC_IMAGE_DIR?.trim();
  if (!value || !isAbsolute(value)) throw new Error("MINBAR_PUBLIC_IMAGE_DIR must be an absolute persistent VPS path");
  const dir = resolve(value);
  const deploymentRoot = resolve(process.cwd());
  if (dir === deploymentRoot || dir.startsWith(deploymentRoot + sep)) {
    throw new Error("MINBAR_PUBLIC_IMAGE_DIR must be outside the release/worktree");
  }
  return dir;
}
function publicOrigin(): string {
  const value = process.env.MINBAR_PUBLIC_IMAGE_ORIGIN?.trim();
  if (!value) throw new Error("MINBAR_PUBLIC_IMAGE_ORIGIN is missing");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.hash || url.search) {
    throw new Error("MINBAR_PUBLIC_IMAGE_ORIGIN must be a public HTTPS origin");
  }
  return url.origin;
}
export function imagePath(filename: string): string | null {
  return imageMediaType(filename) ? join(imageDirectory(), filename) : null;
}
export function imageSignatureMatches(bytes: Buffer, mime: string): boolean {
  if (mime === "image/jpeg") return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/gif") return ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6));
  if (mime === "image/webp") return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (mime === "image/avif") return bytes.length >= 16 && bytes.toString("ascii", 4, 8) === "ftyp" && ["avif", "avis"].includes(bytes.toString("ascii", 8, 12));
  return false;
}
export async function savePublicImage(bytes: Buffer, mime: string): Promise<{url: string; public_id: string}> {
  const ext = MIME_EXT[mime];
  // SVG is excluded: serving arbitrary SVG from our own origin would create a same-origin XSS hazard.
  if (!ext || !bytes.length || !imageSignatureMatches(bytes, mime)) throw new Error("UNSUPPORTED_OR_MISMATCHED_IMAGE");
  const dir = imageDirectory(), origin = publicOrigin();
  await mkdir(dir, { recursive: true, mode: 0o750 });
  const space = await statfs(dir);
  if (Number(space.bavail) * Number(space.bsize) < bytes.length + 1024 * 1024 * 1024) {
    throw new Error("INSUFFICIENT_IMAGE_STORAGE");
  }
  const public_id = "vps-" + randomUUID();
  await writeFile(join(dir, public_id + "." + ext), bytes, { flag: "wx", mode: 0o640 });
  return { url: origin + "/api/upload/media/" + public_id + "." + ext, public_id };
}
export async function removePublicImage(id: string): Promise<void> {
  if (!isVpsImageId(id)) throw new Error("INVALID_PUBLIC_IMAGE_ID");
  const dir = imageDirectory();
  for (const ext of Object.values(MIME_EXT)) {
    try { await unlink(join(dir, id + "." + ext)); return; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
