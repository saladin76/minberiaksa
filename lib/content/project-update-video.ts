import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { normalizeVideoSource } from "./video-platform";
import { SUPPORTED_LOCALES } from "../locales";

/** Runs inside the same transaction as the project update; no duplicate media archive. */
export async function publishProjectUpdateVideo(db: Prisma.TransactionClient, update: { id: string; title: string; description: string; image: string | null; videoUrl: string | null; translations: { locale: string; title: string; description: string }[] }, campaignId: string) {
  if (!update.videoUrl) return null;
  const source = normalizeVideoSource({ url: update.videoUrl });
  if (source.presentation.provider === "invalid") throw new Error("كود التضمين أو رابط الفيديو غير مدعوم");
  return db.video.create({ data: {
    slug: `project-achievement-${update.id}`, type: "ACHIEVEMENT", title: update.title, description: update.description,
    url: source.url, youtubeId: source.youtubeId, thumbnail: update.image, campaignIds: [campaignId], sourceUpdateId: update.id,
    isActive: true, editorVersion: randomUUID(), localeFilter: [],
    translations: { create: update.translations.filter(t => t.locale !== "ar" && (SUPPORTED_LOCALES as readonly string[]).includes(t.locale)).map(t => ({ locale: t.locale, title: t.title, description: t.description })) },
  }, select: { id: true } });
}
