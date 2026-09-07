import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import type { CommunicationSender } from "@prisma/client";
import type { CommunicationSenderConfig } from "./sender-router";
import type { CommunicationChannel } from "./communication-types";
import {
  isCommunicationChannel,
  isCommunicationProvider,
  type CommunicationChannelId,
  type SenderStatusId,
} from "./communication-runtime-types";

/**
 * SenderService — CRUD for CommunicationSender rows and a bridge that maps a stored sender
 * into the pure `CommunicationSenderConfig` the sender-router consumes. Server-side only.
 * No provider tokens are stored here; Meta/Twilio credentials live in the provider connection
 * / environment and are read by the (future) provider adapters — never surfaced to the client.
 */

type Actor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null } | null;

export type SenderInput = {
  channel: CommunicationChannelId;
  provider: string;
  name: string;
  displayName?: string | null;
  phoneNumberId?: string | null;
  displayPhoneNumber?: string | null;
  businessAccountId?: string | null;
  senderEmail?: string | null;
  smsSender?: string | null;
  supportedLocales?: string[];
  supportedCountries?: string[];
  supportedPurposes?: string[];
  qualityRating?: string | null;
  status?: SenderStatusId;
  isDefault?: boolean;
  enabled?: boolean;
  priority?: number;
};

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

function dbUnavailable() {
  return { ok: false as const, status: 503, error: "DATABASE_URL is not configured." };
}

export async function listSenders(): Promise<CommunicationSender[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await prisma.communicationSender.findMany({ orderBy: [{ enabled: "desc" }, { priority: "asc" }, { name: "asc" }] });
  } catch (error) {
    console.error("listSenders failed", error);
    return [];
  }
}

export async function listSendersByChannel(channel: CommunicationChannelId): Promise<CommunicationSender[]> {
  return (await listSenders()).filter((s) => s.channel === channel);
}

export async function getSender(id: string): Promise<CommunicationSender | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    return await prisma.communicationSender.findUnique({ where: { id } });
  } catch (error) {
    console.error("getSender failed", error);
    return null;
  }
}

export async function createSender(input: SenderInput, actor?: Actor): Promise<ServiceResult<CommunicationSender>> {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  if (!isCommunicationChannel(input.channel)) return { ok: false, status: 400, error: "Invalid channel." };
  if (!isCommunicationProvider(input.provider)) return { ok: false, status: 400, error: "Invalid provider." };
  if (!input.name?.trim()) return { ok: false, status: 400, error: "Name is required." };
  try {
    const row = await prisma.communicationSender.create({
      data: {
        channel: input.channel,
        provider: input.provider,
        name: input.name.trim(),
        displayName: input.displayName ?? null,
        phoneNumberId: input.phoneNumberId ?? null,
        displayPhoneNumber: input.displayPhoneNumber ?? null,
        businessAccountId: input.businessAccountId ?? null,
        senderEmail: input.senderEmail ?? null,
        smsSender: input.smsSender ?? null,
        supportedLocales: input.supportedLocales ?? [],
        supportedCountries: input.supportedCountries ?? [],
        supportedPurposes: input.supportedPurposes ?? [],
        qualityRating: input.qualityRating ?? null,
        status: input.status ?? "NOT_CONFIGURED",
        isDefault: input.isDefault ?? false,
        enabled: input.enabled ?? false,
        priority: input.priority ?? 100,
      },
    });
    await writeAuditLog({
      actorId: actor?.actorId ?? undefined,
      actorName: actor?.actorName ?? undefined,
      actorRole: actor?.actorRole ?? "ADMIN",
      action: "communication.sender.create",
      messageAr: `تم إنشاء مُرسِل تواصل: ${row.name}`,
      messageEn: `Communication sender created: ${row.name}`,
      entityType: "CommunicationSender",
      entityId: row.id,
      metadata: { channel: row.channel, provider: row.provider, externalCall: false },
      stream: "TEAM",
    });
    return { ok: true, data: row };
  } catch (error) {
    console.error("createSender failed", error);
    return { ok: false, status: 500, error: "Failed to create sender." };
  }
}

export async function updateSender(id: string, patch: Partial<SenderInput>, actor?: Actor): Promise<ServiceResult<CommunicationSender>> {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  try {
    const row = await prisma.communicationSender.update({
      where: { id },
      data: {
        channel: patch.channel,
        provider: patch.provider,
        name: patch.name?.trim(),
        displayName: patch.displayName ?? undefined,
        phoneNumberId: patch.phoneNumberId ?? undefined,
        displayPhoneNumber: patch.displayPhoneNumber ?? undefined,
        businessAccountId: patch.businessAccountId ?? undefined,
        senderEmail: patch.senderEmail ?? undefined,
        smsSender: patch.smsSender ?? undefined,
        supportedLocales: patch.supportedLocales,
        supportedCountries: patch.supportedCountries,
        supportedPurposes: patch.supportedPurposes,
        qualityRating: patch.qualityRating ?? undefined,
        status: patch.status,
        isDefault: patch.isDefault,
        enabled: patch.enabled,
        priority: patch.priority,
      },
    });
    await writeAuditLog({
      actorId: actor?.actorId ?? undefined,
      actorName: actor?.actorName ?? undefined,
      actorRole: actor?.actorRole ?? "ADMIN",
      action: "communication.sender.update",
      messageAr: `تم تحديث مُرسِل تواصل: ${row.name}`,
      messageEn: `Communication sender updated: ${row.name}`,
      entityType: "CommunicationSender",
      entityId: row.id,
      metadata: { externalCall: false },
      stream: "TEAM",
    });
    return { ok: true, data: row };
  } catch (error) {
    console.error("updateSender failed", error);
    return { ok: false, status: 500, error: "Failed to update sender." };
  }
}

/** Make one sender the default for its channel (clears the flag on the channel's other senders). */
export async function setDefaultSender(id: string, actor?: Actor): Promise<ServiceResult<CommunicationSender>> {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  try {
    const sender = await prisma.communicationSender.findUnique({ where: { id }, select: { channel: true, name: true } });
    if (!sender) return { ok: false, status: 404, error: "Sender not found." };
    await prisma.communicationSender.updateMany({ where: { channel: sender.channel, isDefault: true }, data: { isDefault: false } });
    const row = await prisma.communicationSender.update({ where: { id }, data: { isDefault: true } });
    await writeAuditLog({
      actorId: actor?.actorId ?? undefined,
      actorName: actor?.actorName ?? undefined,
      actorRole: actor?.actorRole ?? "ADMIN",
      action: "communication.sender.set-default",
      messageAr: `تعيين المُرسِل الافتراضي (${sender.channel}): ${sender.name}`,
      messageEn: `Default sender set (${sender.channel}): ${sender.name}`,
      entityType: "CommunicationSender",
      entityId: id,
      metadata: { channel: sender.channel, externalCall: false },
      stream: "TEAM",
    });
    return { ok: true, data: row };
  } catch (error) {
    console.error("setDefaultSender failed", error);
    return { ok: false, status: 500, error: "Failed to set default sender." };
  }
}

/** Map a stored sender into the pure config the sender-router consumes. */
export function toSenderConfig(row: CommunicationSender): CommunicationSenderConfig {
  const status: CommunicationSenderConfig["status"] =
    row.status === "ACTIVE" ? "ACTIVE" : row.status === "NEEDS_ATTENTION" ? "NEEDS_ATTENTION" : "DISABLED";
  return {
    id: row.id,
    channel: row.channel as CommunicationChannel,
    provider: row.provider,
    name: row.name,
    supportedLocales: row.supportedLocales,
    supportedCountries: row.supportedCountries,
    supportedPurposes: row.supportedPurposes,
    status,
    health: row.status === "NEEDS_ATTENTION" ? "DEGRADED" : "UNKNOWN",
    isDefault: row.isDefault,
    enabled: row.enabled,
    priority: row.priority,
  };
}
