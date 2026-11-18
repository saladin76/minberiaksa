import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { GALLERY_PUBLIC_LIMIT, isGalleryImageUrl, type GalleryCaptions, type GalleryImage, type PublicGalleryImage } from "./shared";

const COLLECTION = "SiteGalleryImage";
const raw = (cmd: Record<string, unknown>) => prisma.$runCommandRaw(cmd as Prisma.InputJsonObject);
const rows = (r: unknown) => ((r as { cursor?: { firstBatch?: Record<string, unknown>[] } })?.cursor?.firstBatch ?? []);
const LOCALES = ["ar", "tr", "en", "fr"] as const;

export function cleanCaptions(input: unknown): GalleryCaptions {
  const out: GalleryCaptions = {};
  if (input && typeof input === "object") for (const l of LOCALES) {
    const v = (input as Record<string, unknown>)[l];
    if (typeof v === "string" && v.trim()) out[l] = v.trim().slice(0, 160);
  }
  return out;
}
const toImage = (d: Record<string, unknown>): GalleryImage => ({
  id: String(d._id), url: String(d.url), captions: cleanCaptions(d.captions), visible: d.visible === true,
  order: typeof d.order === "number" ? d.order : 0, createdAt: String(d.createdAt ?? ""),
});

export async function listGallery(): Promise<GalleryImage[]> {
  return rows(await raw({ find: COLLECTION, filter: {}, sort: { order: 1, createdAt: -1 }, limit: 1000 })).map(toImage);
}

let publicCache: { expires: number; images: PublicGalleryImage[] } | null = null;
/** Visible images for the site, newest arrangement first; cached 60 s, cleared on every edit. */
export async function publicGallery(): Promise<PublicGalleryImage[]> {
  if (publicCache && publicCache.expires > Date.now()) return publicCache.images;
  const images = rows(await raw({ find: COLLECTION, filter: { visible: true }, sort: { order: 1, createdAt: -1 }, limit: GALLERY_PUBLIC_LIMIT, maxTimeMS: 2000 }))
    .map(toImage).map(({ id, url, captions }) => ({ id, url, captions }));
  publicCache = { expires: Date.now() + 60_000, images };
  return images;
}
const changed = () => { publicCache = null; };

export async function addGalleryImage(input: { url: unknown; visible: unknown; captions?: unknown; by: string }): Promise<GalleryImage> {
  if (!isGalleryImageUrl(input.url)) throw new Error("INVALID_URL");
  const first = rows(await raw({ find: COLLECTION, filter: {}, sort: { order: 1 }, limit: 1 }))[0];
  const doc = { _id: randomBytes(12).toString("hex"), url: input.url, captions: cleanCaptions(input.captions), visible: input.visible === true,
    order: (typeof first?.order === "number" ? first.order : 0) - 1, createdAt: new Date().toISOString(), createdBy: input.by };
  await raw({ insert: COLLECTION, documents: [doc] });
  changed();
  return toImage(doc);
}

export async function updateGalleryImage(id: string, patch: { visible?: unknown; captions?: unknown }): Promise<void> {
  if (!/^[a-f\d]{24}$/.test(id)) throw new Error("INVALID_ID");
  const $set: Record<string, unknown> = {};
  if (typeof patch.visible === "boolean") $set.visible = patch.visible;
  if (patch.captions !== undefined) $set.captions = cleanCaptions(patch.captions);
  if (!Object.keys($set).length) throw new Error("NOTHING_TO_UPDATE");
  await raw({ update: COLLECTION, updates: [{ q: { _id: id }, u: { $set } }] });
  changed();
}

/** Rewrites the order of every listed image (position = index), in one batch. */
export async function reorderGallery(ids: unknown): Promise<void> {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 1000 || !ids.every((id) => typeof id === "string" && /^[a-f\d]{24}$/.test(id))) throw new Error("INVALID_ID");
  await raw({ update: COLLECTION, updates: (ids as string[]).map((id, index) => ({ q: { _id: id }, u: { $set: { order: index } } })) });
  changed();
}

export async function deleteGalleryImage(id: string): Promise<void> {
  if (!/^[a-f\d]{24}$/.test(id)) throw new Error("INVALID_ID");
  await raw({ delete: COLLECTION, deletes: [{ q: { _id: id }, limit: 1 }] });
  changed();
}
