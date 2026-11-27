import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NOT_SOFT_DELETED } from "@/lib/campaign/soft-delete-filter";
import type { GiftSettings } from "./gift-settings";
import { parseGiftSettings } from "./gift-settings-validation";

const KEY = "gift";
export class GiftSettingsConflict extends Error {}
export class GiftProjectUnavailable extends Error {}

export async function readGiftSettings() {
  const row = await prisma.recurringPageSettings.findUnique({ where: { id: KEY } });
  return { settings: parseGiftSettings(row?.configuration), revision: row?.revision ?? null };
}

/** For the public page: defaults (disabled) when there is no database. */
export async function publicGiftSettings() {
  if (!process.env.DATABASE_URL) return parseGiftSettings(null);
  return (await readGiftSettings()).settings;
}

export async function giftProjectOptions() {
  return prisma.campaign.findMany({ where: { AND: [{ isActive: true }, NOT_SOFT_DELETED] }, select: { id: true, title: true }, orderBy: [{ title: "asc" }, { id: "asc" }] });
}

export async function saveGiftSettings(settings: GiftSettings, revision: string | null) {
  const used = [...settings.projectIds, ...settings.packages.map(p => p.projectId)];
  if (used.length) {
    const available = new Set((await giftProjectOptions()).map(project => project.id.toLowerCase()));
    if (used.some(id => !available.has(id))) throw new GiftProjectUnavailable();
  }
  const nextRevision = randomUUID(), configuration = settings as unknown as Prisma.InputJsonValue;
  if (revision === null) {
    try { await prisma.recurringPageSettings.create({ data: { id: KEY, configuration, revision: nextRevision } }); }
    catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new GiftSettingsConflict(); throw error; }
  } else {
    const changed = await prisma.recurringPageSettings.updateMany({ where: { id: KEY, revision }, data: { configuration, revision: nextRevision } });
    if (changed.count !== 1) throw new GiftSettingsConflict();
  }
  return { settings, revision: nextRevision };
}
