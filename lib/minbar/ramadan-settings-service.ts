import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NOT_SOFT_DELETED } from "@/lib/campaign/soft-delete-filter";
import type { RamadanSettings } from "./ramadan-settings";
import { parseRamadanSettings } from "./ramadan-settings-validation";

const KEY = "ramadan";
export class RamadanSettingsConflict extends Error {}
export class RamadanProjectUnavailable extends Error {}

export async function readRamadanSettings() {
  const row = await prisma.recurringPageSettings.findUnique({ where: { id: KEY } });
  return { settings: parseRamadanSettings(row?.configuration), revision: row?.revision ?? null };
}

/** For the public page and the scheduler: defaults (disabled) when there is no database. */
export async function publicRamadanSettings() {
  if (!process.env.DATABASE_URL) return parseRamadanSettings(null);
  return (await readRamadanSettings()).settings;
}

export async function ramadanProjectOptions() {
  return prisma.campaign.findMany({ where: { AND: [{ isActive: true }, NOT_SOFT_DELETED] }, select: { id: true, title: true }, orderBy: [{ title: "asc" }, { id: "asc" }] });
}

export async function saveRamadanSettings(settings: RamadanSettings, revision: string | null) {
  if (settings.projectIds.length) {
    const available = new Set((await ramadanProjectOptions()).map(project => project.id));
    if (settings.projectIds.some(id => !available.has(id))) throw new RamadanProjectUnavailable();
  }
  const nextRevision = randomUUID(), configuration = settings as unknown as Prisma.InputJsonValue;
  if (revision === null) {
    try { await prisma.recurringPageSettings.create({ data: { id: KEY, configuration, revision: nextRevision } }); }
    catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new RamadanSettingsConflict(); throw error; }
  } else {
    const changed = await prisma.recurringPageSettings.updateMany({ where: { id: KEY, revision }, data: { configuration, revision: nextRevision } });
    if (changed.count !== 1) throw new RamadanSettingsConflict();
  }
  return { settings, revision: nextRevision };
}
