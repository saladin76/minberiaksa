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

function normalizePredicate(input: {
  locale?: string | null;
  country?: string | null;
  purpose?: string | null;
}) {
  return {
    locale: input.locale?.trim().toLowerCase() || null,
    country: input.country?.trim().toUpperCase() || null,
    purpose: input.purpose?.trim() || null,
  };
}

async function findEnabledPredicateConflict(input: {
  channel: CommunicationChannelId;
  locale: string | null;
  country: string | null;
  purpose: string | null;
  excludeId?: string | null;
}) {
  return prisma.senderRoutingRule.findFirst({
    where: {
      channel: input.channel,
      locale: input.locale,
      country: input.country,
      purpose: input.purpose,
      enabled: true,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
    },
    select: { id: true, senderId: true, priority: true },
  });
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

    const { locale: normalizedLocale, country: normalizedCountry, purpose: normalizedPurpose } = normalizePredicate(input);

    /*
     * Multi-language routing creates one stored rule per locale. Saving the same selection again
     * must be idempotent; duplicate rows with identical predicates create ambiguous ties in the
     * router. Reuse/update an exact semantic match instead of inserting another copy.
     */
    const existing = await prisma.senderRoutingRule.findFirst({
      where: {
        channel: input.channel,
        locale: normalizedLocale,
        country: normalizedCountry,
        purpose: normalizedPurpose,
        senderId: input.senderId,
      },
    });
    if (existing) {
      const nextEnabled = input.enabled ?? true;
      if (nextEnabled) {
        const conflict = await findEnabledPredicateConflict({
          channel: input.channel,
          locale: normalizedLocale,
          country: normalizedCountry,
          purpose: normalizedPurpose,
          excludeId: existing.id,
        });
        if (conflict) {
          return {
            ok: false,
            status: 409,
            error: "توجد قاعدة مفعّلة أخرى بنفس القناة واللغة والدولة والغرض. عطّلها أو عدّلها بدل إنشاء مسار متعارض.",
          };
        }
      }
      const row = await prisma.senderRoutingRule.update({
        where: { id: existing.id },
        data: {
          fallbackSenderId: input.fallbackSenderId ?? null,
          priority: input.priority ?? existing.priority,
          enabled: nextEnabled,
          notes: input.notes ?? existing.notes,
        },
      });
      return { ok: true, data: row };
    }

    if (input.enabled ?? true) {
      const conflict = await findEnabledPredicateConflict({
        channel: input.channel,
        locale: normalizedLocale,
        country: normalizedCountry,
        purpose: normalizedPurpose,
      });
      if (conflict) {
        return {
          ok: false,
          status: 409,
          error: "توجد قاعدة مفعّلة أخرى بنفس القناة واللغة والدولة والغرض. استخدم المُرسِل البديل داخل نفس القاعدة بدل إنشاء قاعدة متعارضة.",
        };
      }
    }

    const row = await prisma.senderRoutingRule.create({
      data: {
        channel: input.channel,
        locale: normalizedLocale,
        country: normalizedCountry,
        purpose: normalizedPurpose,
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

    const channel = (patch.channel ?? current.channel) as CommunicationChannelId;
    if (!isCommunicationChannel(channel)) return { ok: false, status: 400, error: "Invalid channel." };

    const primaryId = patch.senderId ?? current.senderId;
    const fallbackId = patch.fallbackSenderId === undefined ? current.fallbackSenderId : patch.fallbackSenderId;
    const predicate = normalizePredicate({
      locale: patch.locale === undefined ? current.locale : patch.locale,
      country: patch.country === undefined ? current.country : patch.country,
      purpose: patch.purpose === undefined ? current.purpose : patch.purpose,
    });
    const nextEnabled = patch.enabled ?? current.enabled;

    const primary = await prisma.communicationSender.findUnique({ where: { id: primaryId }, select: { channel: true } });
    if (!primary || primary.channel !== channel) return { ok: false, status: 400, error: "Primary sender is missing or belongs to another channel." };
    if (fallbackId) {
      if (fallbackId === primaryId) return { ok: false, status: 400, error: "Fallback sender must be different from primary sender." };
      const fallback = await prisma.communicationSender.findUnique({ where: { id: fallbackId }, select: { channel: true } });
      if (!fallback || fallback.channel !== channel) return { ok: false, status: 400, error: "Fallback sender is missing or belongs to another channel." };
    }

    if (nextEnabled) {
      const conflict = await findEnabledPredicateConflict({
        channel,
        locale: predicate.locale,
        country: predicate.country,
        purpose: predicate.purpose,
        excludeId: id,
      });
      if (conflict) {
        return {
          ok: false,
          status: 409,
          error: "لا يمكن تفعيل هذه القاعدة لأن قاعدة مفعّلة أخرى تستخدم نفس القناة واللغة والدولة والغرض.",
        };
      }
    }

    const row = await prisma.senderRoutingRule.update({
      where: { id },
      data: {
        channel,
        locale: predicate.locale,
        country: predicate.country,
        purpose: predicate.purpose,
        senderId: primaryId,
        fallbackSenderId: fallbackId ?? null,
        priority: patch.priority,
        enabled: nextEnabled,
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

export async function deleteRoutingRule(id: string, actor?: Actor): Promise<ServiceResult<{ id: string }>> {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  try {
    const current = await prisma.senderRoutingRule.findUnique({ where: { id } });
    if (!current) return { ok: false, status: 404, error: "Routing rule not found." };

    await prisma.senderRoutingRule.delete({ where: { id } });
    await writeAuditLog({
      actorId: actor?.actorId ?? undefined,
      actorName: actor?.actorName ?? undefined,
      actorRole: actor?.actorRole ?? "ADMIN",
      action: "communication.routing-rule.delete",
      messageAr: "تم حذف قاعدة توجيه مُرسِل",
      messageEn: "Sender routing rule deleted",
      entityType: "SenderRoutingRule",
      entityId: id,
      metadata: { channel: current.channel, senderId: current.senderId, fallbackSenderId: current.fallbackSenderId ?? null, externalCall: false },
      stream: "TEAM",
    });
    return { ok: true, data: { id } };
  } catch (error) {
    console.error("deleteRoutingRule failed", error);
    return { ok: false, status: 500, error: "Failed to delete routing rule." };
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
