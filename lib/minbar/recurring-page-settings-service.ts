import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NOT_SOFT_DELETED } from "@/lib/campaign/soft-delete-filter";
import type { RecurringPageSettings } from "./recurring-page-settings";
import { parseRecurringPageSettings } from "./recurring-page-settings-validation";

const KEY = "public";
export class RecurringPageSettingsConflict extends Error {}
export class RecurringPageProjectUnavailable extends Error {}

export async function readRecurringPageSettings() {
  const row = await prisma.recurringPageSettings.findUnique({ where: { id: KEY } });
  return { settings: parseRecurringPageSettings(row?.configuration), revision: row?.revision ?? null };
}

export async function publicRecurringPageSettings() {
  // Builds without a database retain the existing defaults; a production read
  // failure must not silently replace a hand-picked fund list with all funds.
  if (!process.env.DATABASE_URL) return parseRecurringPageSettings(null);
  return (await readRecurringPageSettings()).settings;
}

export async function recurringPageProjectOptions() {
  return prisma.campaign.findMany({ where: { AND: [{ isActive: true }, NOT_SOFT_DELETED] }, select: { id: true, title: true }, orderBy: [{ title: "asc" }, { id: "asc" }] });
}

export async function saveRecurringPageSettings(settings: RecurringPageSettings, revision: string | null) {
  if (settings.projectMode === "SELECTED") {
    const projects = await recurringPageProjectOptions();
    const available = new Set(projects.map(project => project.id));
    if (settings.projectIds.some(id => !available.has(id))) throw new RecurringPageProjectUnavailable();
  }
  const nextRevision = randomUUID(), configuration = settings as unknown as Prisma.InputJsonValue;
  if (revision === null) {
    try { await prisma.recurringPageSettings.create({ data: { id: KEY, configuration, revision: nextRevision } }); }
    catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new RecurringPageSettingsConflict(); throw error; }
  } else {
    const changed = await prisma.recurringPageSettings.updateMany({ where: { id: KEY, revision }, data: { configuration, revision: nextRevision } });
    if (changed.count !== 1) throw new RecurringPageSettingsConflict();
  }
  return { settings, revision: nextRevision };
}
