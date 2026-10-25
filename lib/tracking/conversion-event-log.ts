import { prisma } from "@/lib/prisma";
import { ensureConversionEventIndexes } from "@/lib/tracking/conversion-event-indexes";
import { rawCommand, firstBatch } from "@/lib/prisma-raw-command";

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

export async function getServerConversionState(platform: ConversionPlatform, eventId: string) {
  const reply = await prisma.$runCommandRaw({ find: "ConversionEvent", filter: { platform, eventId, channel: "server" }, projection: { status: 1 }, limit: 1 });
  return firstBatch(reply)[0]?.status as ConversionEventStatus | undefined;
}

/** Atomic lease plus the existing unique event index prevent concurrent webhook sends. */
export async function claimServerConversion(input: Pick<RecordConversionEventInput, "donationId" | "eventId" | "eventName" | "platform">): Promise<boolean> {
  if (!await ensureConversionEventIndexes()) throw new Error("Conversion event unique index unavailable");
  try {
    const reply = await prisma.$runCommandRaw(rawCommand({
      findAndModify: "ConversionEvent",
      query: { platform: input.platform, eventId: input.eventId, channel: "server", status: { $ne: "SENT" }, $or: [{ leaseUntilMs: { $exists: false } }, { leaseUntilMs: { $lte: Date.now() } }] },
      update: { $set: { ...input, channel: "server", status: "PENDING", leaseUntilMs: Date.now() + 120_000, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date(), attempts: 0 } },
      upsert: true, new: true,
    }));
    return !!(reply && typeof reply === "object" && "value" in reply && reply.value);
  } catch (error) {
    // An existing SENT/leased record fails the query and collides on the unique key.
    if (/E11000|duplicate key/i.test(String(error))) return false;
    throw error;
  }
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

    await prisma.$runCommandRaw(rawCommand({
      update: "ConversionEvent",
      updates: [{
        q: { platform: input.platform, eventId: input.eventId, channel: input.channel },
        u: {
          $set: setDoc,
          $unset: { leaseUntilMs: "", ...(!input.error ? { error: "" } : {}) },
          $setOnInsert: { createdAt: now },
          $inc: { attempts: 1 },
        },
        upsert: true,
      }],
    }));
  } catch (error) {
    console.error("[conversion-event-log] failed", error);
  }
}
