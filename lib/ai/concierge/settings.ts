import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sanitizeConciergeSettings, type ConciergeSettings } from "./settings-shape";

/**
 * Server-side read and write of the concierge settings. Read on every
 * concierge request, so cached for a short while per server instance; a save
 * from the dashboard clears this instance's copy at once and the others catch
 * up within the TTL.
 */

const CACHE_TTL_MS = 60 * 1000;
let cached: { value: ConciergeSettings; at: number } | null = null;

export async function loadConciergeSettings(): Promise<ConciergeSettings> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  try {
    const row = await prisma.globalSettings.findFirst({ orderBy: { createdAt: "asc" }, select: { aiConcierge: true } });
    const value = sanitizeConciergeSettings(row?.aiConcierge ?? null);
    cached = { value, at: Date.now() };
    return value;
  } catch (error) {
    console.error("[concierge] settings read failed", error instanceof Error ? error.message : error);
    /* A settings outage must not take the assistant down: defaults. */
    return sanitizeConciergeSettings(null);
  }
}

export async function saveConciergeSettings(input: unknown): Promise<{ id: string; settings: ConciergeSettings; updatedAt: Date }> {
  const settings = sanitizeConciergeSettings(input);
  const existing = (await prisma.globalSettings.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } })) ?? (await prisma.globalSettings.create({ data: {}, select: { id: true } }));
  const saved = await prisma.globalSettings.update({
    where: { id: existing.id },
    data: { aiConcierge: settings as unknown as Prisma.InputJsonValue },
    select: { id: true, updatedAt: true },
  });
  cached = { value: settings, at: Date.now() };
  return { id: saved.id, settings, updatedAt: saved.updatedAt };
}
