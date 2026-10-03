import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import type { SenderRoutingRule } from "@prisma/client";
import type { SenderRoutingRuleConfig } from "./sender-router";
import type { CommunicationChannel } from "./communication-types";
import { isCommunicationChannel, type CommunicationChannelId } from "./communication-runtime-types";

/**
 * RoutingRuleService  CRUD for SenderRoutingRule rows and a bridge into the pure
 * `SenderRoutingRuleConfig` the sender-router consumes. Server-side only, no sending.
 * Changing routing is an audited action (security rule 5).
 */

type Actor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null } | null;

export type RoutingRuleInput = {
  channel: CommunicationChannelId;
  locale?: string | null;
  country?: string | null;
  purpose?: string | null;
  senderId: string;
  fallbackSenderId?: string | null;
  priority?: number;
  enabled?: boolean;
  notes?: string | null;
};

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

function dbUnavailable() {
  return { ok: false as const, status: 503, error: "DATABASE_URL is not configured." };
}

export async function listRoutingRules(channel?: CommunicationChannelId): Promise<SenderRoutingRule[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await prisma.senderRoutingRule.findMany({
      where: channel ? { channel } : undefined,
      orderBy: [{ enabled: "desc" }, { priority: "asc" }],
    });
  } catch (error) {
    console.error("listRoutingRules failed", error);
    return [];
  }
}

export async function createRoutingRule(input: RoutingRuleInput, actor?: Actor): Promise<ServiceResult<SenderRoutingRule>> {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  if (!isCommunicationChannel(input.channel)) return { ok: false, status: 400, error: "Invalid channel." };
  if (!input.senderId) return { ok: false, status: 400, error: "senderId is required." };
  try {
    const primary = await prisma.communicationSender.findUnique({ where: { id: input.senderId }, select: { id: true, channel: true } });
    if (!primary) return { ok: false, status: 400, error: "Primary sender not found." };
    if (primary.channel !== input.channel) return { ok: false, status: 400, error: "Primary sender channel does not match the routing rule channel." };

    if (input.fallbackSenderId) {
      if (input.fallbackSenderId === input.senderId) return { ok: false, status: 400, error: "Fallback sender must be different from primary sender." };
      const fallback = await prisma.communicationSender.findUnique({ where: { id: input.fallbackSenderId }, select: { channel: true } });
      if (!fallback) return { ok: false, status: 400, error: "Fallback sender not found." };
      if (fallback.channel !== input.channel) return { ok: false, status: 400, error: "Fallback sender channel does not match the routing rule channel." };
    }

    const row = await prisma.senderRoutingRule.create({
      data: {
        channel: input.channel,
        locale: input.locale?.toLowerCase() ?? null,
        country: input.country?.toUpperCase() ?? null,
        purpose: input.purpose ?? null,
        senderId: input.senderId,
        fallbackSenderId: input.fallbackSenderId ?? null,
        priority: input.priority ?? 100,
        enabled: input.enabled ?? true,
        notes: input.notes ?? null,
      },
    });
    await writeAuditLog({
      actorId: actor?.actorId ?? undefined,
      actorName: actor?.actorName ?? undefined,
      actorRole: actor?.actorRole ?? "ADMIN",
      action: "communication.routing-rule.create",
      messageAr: `تم إنشاء قاعدة توجيه مُرسِل (${row.channel})`,
      messageEn: `Sender routing rule created (${row.channel})`,
      entityType: "SenderRoutingRule",
      entityId: row.id,
      metadata: { channel: row.channel, locale: row.locale, country: row.country, externalCall: false },
      stream: "TEAM",
    });
    return { ok: true, data: row };
  } catch (error) {
    console.error("createRoutingRule failed", error);
    return { ok: false, status: 500, error: "Failed to create routing rule." };
  }
}

export async function updateRoutingRule(id: string, patch: Partial<RoutingRuleInput>, actor?: Actor): Promise<ServiceResult<SenderRoutingRule>> {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  try {
    const current = await prisma.senderRoutingRule.findUnique({ where: { id } });
    if (!current) return { ok: false, status: 404, error: "Routing rule not found." };
    const channel = current.channel as CommunicationChannelId;
    const primaryId = patch.senderId ?? current.senderId;
    const fallbackId = patch.fallbackSenderId === undefined ? current.fallbackSenderId : patch.fallbackSenderId;

    const primary = await prisma.communicationSender.findUnique({ where: { id: primaryId }, select: { channel: true } });
    if (!primary || primary.channel !== channel) return { ok: false, status: 400, error: "Primary sender is missing or belongs to another channel." };
    if (fallbackId) {
      if (fallbackId === primaryId) return { ok: false, status: 400, error: "Fallback sender must be different from primary sender." };
      const fallback = await prisma.communicationSender.findUnique({ where: { id: fallbackId }, select: { channel: true } });
      if (!fallback || fallback.channel !== channel) return { ok: false, status: 400, error: "Fallback sender is missing or belongs to another channel." };
    }

    const row = await prisma.senderRoutingRule.update({
      where: { id },
      data: {
        channel: patch.channel,
        locale: patch.locale === undefined ? undefined : patch.locale?.toLowerCase() ?? null,
        country: patch.country === undefined ? undefined : patch.country?.toUpperCase() ?? null,
        purpose: patch.purpose === undefined ? undefined : patch.purpose ?? null,
        senderId: patch.senderId,
        fallbackSenderId: patch.fallbackSenderId === undefined ? undefined : patch.fallbackSenderId ?? null,
        priority: patch.priority,
        enabled: patch.enabled,
        notes: patch.notes === undefined ? undefined : patch.notes ?? null,
      },
    });
    await writeAuditLog({
      actorId: actor?.actorId ?? undefined,
      actorName: actor?.actorName ?? undefined,
      actorRole: actor?.actorRole ?? "ADMIN",
      action: "communication.routing-rule.update",
      messageAr: `تم تحديث قاعدة توجيه مُرسِل`,
      messageEn: `Sender routing rule updated`,
      entityType: "SenderRoutingRule",
      entityId: row.id,
      metadata: { externalCall: false },
      stream: "TEAM",
    });
    return { ok: true, data: row };
  } catch (error) {
    console.error("updateRoutingRule failed", error);
    return { ok: false, status: 500, error: "Failed to update routing rule." };
  }
}

/** Map a stored routing rule into the pure config the sender-router consumes. */
export function toRoutingRuleConfig(row: SenderRoutingRule): SenderRoutingRuleConfig {
  return {
    channel: row.channel as CommunicationChannel,
    locale: row.locale,
    country: row.country,
    purpose: row.purpose,
    senderId: row.senderId,
    fallbackSenderId: row.fallbackSenderId,
    priority: row.priority,
    enabled: row.enabled,
  };
}
