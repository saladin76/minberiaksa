import { prisma } from "@/lib/prisma";
import { ensureConversionEventIndexes } from "@/lib/tracking/conversion-event-indexes";

export type ConversionPlatform = "META" | "GA4" | "GOOGLE_ADS" | "TIKTOK" | "X" | "VERCEL";
export type ConversionChannel = "server" | "browser";
export type ConversionEventStatus = "PENDING" | "SENT" | "FAILED" | "SKIPPED";

export interface RecordConversionEventInput {
  donationId?: string | null;
  eventId: string;
  eventName: string;
  platform: ConversionPlatform;
  channel: ConversionChannel;
  status: ConversionEventStatus;
  dedupKey?: string | null;
  value?: number | null;
  currency?: string | null;
  error?: string | null;
  request?: unknown;
  response?: unknown;
  sentAt?: Date | null;
}

function addDefined(target: Record<string, unknown>, key: string, value: unknown) {
  if (value === undefined || value === null) return;
  if (typeof value === "string" && value.trim() === "") return;
  target[key] = value;
}

export async function recordConversionEvent(input: RecordConversionEventInput): Promise<void> {
  try {
    await ensureConversionEventIndexes();

    const now = new Date();
    const sentAt = input.status === "SENT" ? input.sentAt ?? now : input.sentAt ?? null;
    const setDoc: Record<string, unknown> = {
      eventId: input.eventId,
      eventName: input.eventName,
      platform: input.platform,
      channel: input.channel,
      status: input.status,
      dedupKey: input.dedupKey ?? input.eventId,
      updatedAt: now,
    };

    addDefined(setDoc, "donationId", input.donationId ?? undefined);
    if (typeof input.value === "number" && Number.isFinite(input.value)) setDoc.value = input.value;
    addDefined(setDoc, "currency", input.currency ?? undefined);
    addDefined(setDoc, "error", input.error ? String(input.error).slice(0, 800) : undefined);
    addDefined(setDoc, "request", input.request);
    addDefined(setDoc, "response", input.response);
    addDefined(setDoc, "sentAt", sentAt ?? undefined);

    await prisma.$runCommandRaw({
      update: "ConversionEvent",
      updates: [{
        q: { platform: input.platform, eventId: input.eventId, channel: input.channel },
        u: {
          $set: setDoc,
          $setOnInsert: { createdAt: now, attempts: 0 },
          $inc: { attempts: 1 },
        },
        upsert: true,
      }],
    });
  } catch (error) {
    console.error("[conversion-event-log] failed", error);
  }
}
