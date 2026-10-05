import "server-only";

import { prisma } from "@/lib/prisma";
import type { CommunicationCampaign } from "@prisma/client";

export type CampaignSpeedMode = "SAFE" | "BALANCED" | "FAST" | "MAX";
export type CampaignSendControls = {
  paused: boolean;
  speedMode: CampaignSpeedMode;
  dailyCap: number;
  quietHours: {
    enabled: boolean;
    start: string; // HH:mm
    end: string;   // HH:mm
    timezone: string;
  };
};

const SPEEDS: Record<CampaignSpeedMode, { batchSize: number; concurrency: number; labelAr: string }> = {
  SAFE: { batchSize: 100, concurrency: 5, labelAr: "هادئ" },
  BALANCED: { batchSize: 250, concurrency: 10, labelAr: "متوازن" },
  FAST: { batchSize: 500, concurrency: 25, labelAr: "سريع" },
  MAX: { batchSize: 1000, concurrency: 40, labelAr: "أقصى سرعة آمنة" },
};

function hhmm(value: unknown, fallback: string): string {
  const text = String(value ?? "");
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : fallback;
}

function positiveInt(value: unknown, fallback: number, max = 1_000_000): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : fallback;
}

export function campaignSendControls(campaign: Pick<CommunicationCampaign, "metadata">): CampaignSendControls {
  const metadata = (campaign.metadata as Record<string, unknown> | null) ?? {};
  const raw = (metadata.sendControls && typeof metadata.sendControls === "object"
    ? metadata.sendControls
    : {}) as Record<string, unknown>;
  const quiet = (raw.quietHours && typeof raw.quietHours === "object"
    ? raw.quietHours
    : {}) as Record<string, unknown>;
  const speed = String(raw.speedMode ?? "BALANCED").toUpperCase() as CampaignSpeedMode;
  const defaultCap = positiveInt(process.env.COMMUNICATION_WHATSAPP_DAILY_CAP, 100_000);

  return {
    paused: raw.paused === true,
    speedMode: speed in SPEEDS ? speed : "BALANCED",
    dailyCap: positiveInt(raw.dailyCap, defaultCap),
    quietHours: {
      enabled: quiet.enabled !== false,
      start: hhmm(quiet.start, "00:00"),
      end: hhmm(quiet.end, "08:00"),
      timezone: typeof quiet.timezone === "string" && quiet.timezone.trim() ? quiet.timezone.trim() : "Europe/Istanbul",
    },
  };
}

export function speedSettings(mode: CampaignSpeedMode) {
  return SPEEDS[mode] ?? SPEEDS.BALANCED;
}

function localMinutes(date: Date, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
  } catch {
    return null;
  }
}

function parseMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function insideQuietHours(controls: CampaignSendControls, now = new Date()): boolean {
  if (!controls.quietHours.enabled) return false;
  const current = localMinutes(now, controls.quietHours.timezone);
  if (current == null) return false;
  const start = parseMinutes(controls.quietHours.start);
  const end = parseMinutes(controls.quietHours.end);
  if (start === end) return true; // explicit 24h quiet window
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export async function whatsappSentLast24Hours(): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.communicationDelivery.count({
    where: {
      channel: "WHATSAPP",
      sentAt: { gte: since },
      status: { in: ["SENT", "DELIVERED", "READ", "REPLIED"] },
    },
  }).catch(() => 0);
}

export async function evaluateCampaignSendControls(
  campaign: Pick<CommunicationCampaign, "channel" | "metadata">,
): Promise<{ ok: true; controls: CampaignSendControls; remainingDaily: number | null } | { ok: false; controls: CampaignSendControls; reason: "PAUSED" | "QUIET_HOURS" | "DAILY_CAP_REACHED"; remainingDaily: number | null }> {
  const controls = campaignSendControls(campaign);
  if (controls.paused) return { ok: false, controls, reason: "PAUSED", remainingDaily: null };
  if (insideQuietHours(controls)) return { ok: false, controls, reason: "QUIET_HOURS", remainingDaily: null };

  if (campaign.channel === "WHATSAPP") {
    const used = await whatsappSentLast24Hours();
    const remaining = Math.max(controls.dailyCap - used, 0);
    if (remaining <= 0) return { ok: false, controls, reason: "DAILY_CAP_REACHED", remainingDaily: 0 };
    return { ok: true, controls, remainingDaily: remaining };
  }
  return { ok: true, controls, remainingDaily: null };
}
