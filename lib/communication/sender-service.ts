import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import type { CommunicationSender } from "@prisma/client";
import type { CommunicationSenderConfig } from "./sender-router";
import type { CommunicationChannel } from "./communication-types";
import { ensureWabaWebhookSubscription, verifySenderOwnership, verifyWabaInBusinessPortfolio } from "./providers/meta-whatsapp/client";
import { reconcilePublishedTemplatesToActiveWabas } from "./meta-template-publisher";
import {
  isCommunicationChannel,
  isCommunicationProvider,
  type CommunicationChannelId,
  type SenderStatusId,
} from "./communication-runtime-types";

/**
 * SenderService  CRUD for CommunicationSender rows and a bridge that maps a stored sender
 * into the pure `CommunicationSenderConfig` the sender-router consumes. Server-side only.
 * No provider tokens are stored here; Meta/Twilio credentials live in the provider connection
 * / environment and are read by the (future) provider adapters  never surfaced to the client.
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
    if (input.channel === "WHATSAPP" && input.phoneNumberId) {
      const duplicate = await prisma.communicationSender.findFirst({
        where: { channel: "WHATSAPP", phoneNumberId: input.phoneNumberId },
        select: { id: true, name: true },
      });
      if (duplicate) return { ok: false, status: 409, error: `Phone Number ID مستخدم بالفعل في المُرسِل «${duplicate.name}».` };
    }

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
    const current = await prisma.communicationSender.findUnique({ where: { id } });
    if (!current) return { ok: false, status: 404, error: "Sender not found." };

    if (patch.phoneNumberId) {
      const duplicate = await prisma.communicationSender.findFirst({
        where: { id: { not: id }, channel: "WHATSAPP", phoneNumberId: patch.phoneNumberId },
        select: { id: true, name: true },
      });
      if (duplicate) return { ok: false, status: 409, error: `Phone Number ID مستخدم بالفعل في المُرسِل «${duplicate.name}».` };
    }

    if (current.isDefault && (patch.enabled === false || (patch.status && patch.status !== "ACTIVE"))) {
      return { ok: false, status: 409, error: "لا يمكن تعطيل المُرسِل الافتراضي أو تغيير حالته عن ACTIVE. عيّن مُرسِلًا افتراضيًا آخر أولًا." };
    }

    const row = await prisma.communicationSender.update({
      where: { id },
      data: {
        channel: patch.channel,
        provider: patch.provider,
        name: patch.name?.trim(),
        displayName: "displayName" in patch ? patch.displayName : undefined,
        phoneNumberId: "phoneNumberId" in patch ? patch.phoneNumberId : undefined,
        displayPhoneNumber: "displayPhoneNumber" in patch ? patch.displayPhoneNumber : undefined,
        businessAccountId: "businessAccountId" in patch ? patch.businessAccountId : undefined,
        senderEmail: "senderEmail" in patch ? patch.senderEmail : undefined,
        smsSender: "smsSender" in patch ? patch.smsSender : undefined,
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

/**
 * Hard deletion is deliberately conservative. A sender that has ever been used is part of the
 * communication audit trail and must be disabled instead of erased. Routing references and a
 * default flag must also be resolved explicitly before deletion.
 */
export async function deleteSender(id: string, actor?: Actor): Promise<ServiceResult<{ id: string }>> {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  try {
    const sender = await prisma.communicationSender.findUnique({ where: { id } });
    if (!sender) return { ok: false, status: 404, error: "Sender not found." };
    if (sender.isDefault) {
      return { ok: false, status: 409, error: "لا يمكن حذف المُرسِل الافتراضي. عيّن مُرسِلًا افتراضيًا آخر أولًا." };
    }

    const [primaryRules, fallbackRules, deliveries, providerEvents] = await Promise.all([
      prisma.senderRoutingRule.count({ where: { senderId: id } }),
      prisma.senderRoutingRule.count({ where: { fallbackSenderId: id } }),
      prisma.communicationDelivery.count({ where: { senderId: id } }),
      prisma.communicationProviderEvent.count({ where: { senderId: id } }),
    ]);

    if (primaryRules || fallbackRules) {
      return {
        ok: false,
        status: 409,
        error: `لا يمكن حذف المُرسِل لأنه مستخدم في قواعد التوجيه (${primaryRules + fallbackRules}). عدّل أو احذف القواعد المرتبطة أولًا.`,
      };
    }
    if (deliveries || providerEvents) {
      return {
        ok: false,
        status: 409,
        error: "لا يمكن حذف مُرسِل له سجل إرسال أو أحداث سابقة حفاظًا على سجل التدقيق. عطّله بدلًا من حذفه.",
      };
    }

    await prisma.communicationSender.delete({ where: { id } });
    await writeAuditLog({
      actorId: actor?.actorId ?? undefined,
      actorName: actor?.actorName ?? undefined,
      actorRole: actor?.actorRole ?? "ADMIN",
      action: "communication.sender.delete",
      messageAr: `تم حذف مُرسِل تواصل: ${sender.name}`,
      messageEn: `Communication sender deleted: ${sender.name}`,
      entityType: "CommunicationSender",
      entityId: id,
      metadata: { channel: sender.channel, provider: sender.provider, externalCall: false },
      stream: "TEAM",
    });
    return { ok: true, data: { id } };
  } catch (error) {
    console.error("deleteSender failed", error);
    return { ok: false, status: 500, error: "Failed to delete sender." };
  }
}

/**
 * Validate one stored WhatsApp sender against Meta and persist the health result. A sender only
 * becomes routable (ACTIVE + enabled) after Meta confirms that the Phone Number ID belongs to the
 * configured WABA under the active app credentials.
 */
export async function verifyWhatsappSender(id: string, actor?: Actor): Promise<ServiceResult<CommunicationSender>> {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  const sender = await prisma.communicationSender.findUnique({ where: { id } }).catch(() => null);
  if (!sender) return { ok: false, status: 404, error: "Sender not found." };
  if (sender.channel !== "WHATSAPP" || sender.provider !== "META_WHATSAPP") {
    return { ok: false, status: 400, error: "التحقق من Meta متاح لمرسلي WhatsApp فقط." };
  }
  if (!sender.phoneNumberId || !sender.businessAccountId) {
    return { ok: false, status: 400, error: "Phone Number ID وWABA ID مطلوبان قبل التحقق." };
  }

  const checkedAt = new Date();

  const portfolio = await verifyWabaInBusinessPortfolio(sender.businessAccountId);
  if (!portfolio.ok) {
    const row = await prisma.communicationSender.update({
      where: { id },
      data: {
        status: portfolio.reason === "META_BUSINESS_PORTFOLIO_NOT_CONFIGURED" ? "NOT_CONFIGURED" : "NEEDS_ATTENTION",
        enabled: false,
        lastHealthCheckAt: checkedAt,
        lastError: [portfolio.reason, portfolio.detail].filter(Boolean).join(" · ").slice(0, 500),
      },
    });
    await writeAuditLog({
      actorId: actor?.actorId ?? undefined,
      actorName: actor?.actorName ?? undefined,
      actorRole: actor?.actorRole ?? "ADMIN",
      action: "communication.sender.verify.failed",
      messageAr: `فشل ربط WABA بحساب الأعمال الرئيسي: ${sender.name}`,
      messageEn: `WABA is not linked to the root Business Portfolio: ${sender.name}`,
      entityType: "CommunicationSender",
      entityId: id,
      metadata: { reason: portfolio.reason, externalCall: true },
      stream: "TEAM",
    });
    return { ok: false, status: 422, error: row.lastError ?? portfolio.reason };
  }

  const verification = await verifySenderOwnership(sender.phoneNumberId, sender.businessAccountId);
  if (!verification.ok) {
    const status = verification.reason === "META_WHATSAPP_NOT_CONFIGURED" ? "NOT_CONFIGURED" : "NEEDS_ATTENTION";
    const row = await prisma.communicationSender.update({
      where: { id },
      data: {
        status,
        enabled: false,
        lastHealthCheckAt: checkedAt,
        lastError: [verification.reason, verification.detail].filter(Boolean).join(" · ").slice(0, 500),
      },
    });
    await writeAuditLog({
      actorId: actor?.actorId ?? undefined,
      actorName: actor?.actorName ?? undefined,
      actorRole: actor?.actorRole ?? "ADMIN",
      action: "communication.sender.verify.failed",
      messageAr: `فشل التحقق من مُرسِل واتساب: ${sender.name}`,
      messageEn: `WhatsApp sender verification failed: ${sender.name}`,
      entityType: "CommunicationSender",
      entityId: id,
      metadata: { reason: verification.reason, externalCall: true },
      stream: "TEAM",
    });
    return { ok: false, status: verification.reason === "META_WHATSAPP_NOT_CONFIGURED" ? 409 : 422, error: row.lastError ?? verification.reason };
  }

  const subscription = await ensureWabaWebhookSubscription(sender.businessAccountId);
  if (!subscription.ok) {
    const row = await prisma.communicationSender.update({
      where: { id },
      data: {
        status: "NEEDS_ATTENTION",
        enabled: false,
        lastHealthCheckAt: checkedAt,
        lastError: ["WABA_WEBHOOK_SUBSCRIPTION_FAILED", subscription.reason, subscription.detail].filter(Boolean).join(" · ").slice(0, 500),
      },
    });
    await writeAuditLog({
      actorId: actor?.actorId ?? undefined,
      actorName: actor?.actorName ?? undefined,
      actorRole: actor?.actorRole ?? "ADMIN",
      action: "communication.sender.verify.failed",
      messageAr: `تم التحقق من الرقم لكن تعذر اشتراك WABA في Webhook: ${sender.name}`,
      messageEn: `Phone verified but WABA webhook subscription failed: ${sender.name}`,
      entityType: "CommunicationSender",
      entityId: id,
      metadata: { reason: subscription.reason, externalCall: true },
      stream: "TEAM",
    });
    return { ok: false, status: 422, error: row.lastError ?? subscription.reason };
  }

  const row = await prisma.communicationSender.update({
    where: { id },
    data: {
      status: "ACTIVE",
      enabled: true,
      displayPhoneNumber: verification.displayPhoneNumber || sender.displayPhoneNumber,
      displayName: verification.verifiedName || sender.displayName,
      qualityRating: verification.qualityRating,
      lastHealthCheckAt: checkedAt,
      lastError: null,
    },
  });
  await writeAuditLog({
    actorId: actor?.actorId ?? undefined,
    actorName: actor?.actorName ?? undefined,
    actorRole: actor?.actorRole ?? "ADMIN",
    action: "communication.sender.verify",
    messageAr: `تم التحقق من مُرسِل واتساب عبر Meta: ${row.name}`,
    messageEn: `WhatsApp sender verified with Meta: ${row.name}`,
    entityType: "CommunicationSender",
    entityId: id,
    metadata: { qualityRating: row.qualityRating, businessPortfolioVerified: true, wabaRelationship: portfolio.asset.relationship, webhookSubscribed: true, subscriptionAppIds: subscription.appIds, externalCall: true },
    stream: "TEAM",
  });

  await reconcilePublishedTemplatesToActiveWabas(actor).catch((error) => {
    console.error("WhatsApp template reconciliation after sender activation failed", {
      senderId: row.id,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  return { ok: true, data: row };
}

/** Make one sender the default for its channel (clears the flag on the channel's other senders). */
export async function setDefaultSender(id: string, actor?: Actor): Promise<ServiceResult<CommunicationSender>> {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  try {
    const sender = await prisma.communicationSender.findUnique({ where: { id } });
    if (!sender) return { ok: false, status: 404, error: "Sender not found." };
    if (!sender.enabled || sender.status !== "ACTIVE") {
      return { ok: false, status: 409, error: "لا يمكن تعيين مُرسِل غير نشط كافتراضي. فعّله وتأكد من سلامة حالته أولًا." };
    }
    if (sender.channel === "WHATSAPP" && (!sender.phoneNumberId || !sender.businessAccountId || !sender.displayPhoneNumber)) {
      return { ok: false, status: 409, error: "مرسل واتساب غير مكتمل: Phone Number ID وWABA ID والرقم الظاهر مطلوبة." };
    }

    const row = await prisma.$transaction(async (tx) => {
      await tx.communicationSender.updateMany({ where: { channel: sender.channel, isDefault: true }, data: { isDefault: false } });
      return tx.communicationSender.update({ where: { id }, data: { isDefault: true } });
    });
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
