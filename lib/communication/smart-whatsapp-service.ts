import "server-only";

import { prisma } from "@/lib/prisma";
import { createDeliveryRecord, markDeliveryStatus } from "./delivery-log-service";
import { conversationId } from "./conversation-service";
import { replyWindowFor, sendConversationReply } from "./conversation-reply-service";
import { normalizePhoneE164, phoneMatchVariants } from "./phone";
import { loadSenderRoutingSnapshot, resolveSenderFromSnapshot } from "./sender-resolution";
import { getActiveMetaWhatsappRuntimeConfig } from "./runtime-config";
import { loadContextsForUserIds } from "@/lib/templates/variables";
import { renderChannelTemplate } from "./template-compat";
import { resolveMetaTemplateMapping } from "./automatic-message-dispatcher";
import { buildMetaComponents } from "./providers/meta-whatsapp/parameters";
import { isValidLocale, type SupportedLocale } from "@/lib/locales";
import { writeAuditLog } from "@/lib/audit-log";

type Actor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null } | null;
export type SmartWhatsappMode = "AUTO" | "FREEFORM" | "UTILITY" | "MARKETING";

export type SmartWhatsappContext = {
  userId: string;
  phone: string | null;
  name: string | null;
  locale: string;
  country: string | null;
  doNotContact: boolean;
  whatsappOptIn: boolean;
  directSendEnabled: boolean;
  conversationId: string | null;
  replyWindow: Awaited<ReturnType<typeof replyWindowFor>>;
  sender: { id: string; name: string; phone: string | null } | null;
  marketingTemplates: Array<{ id: string; name: string; category: string | null }>;
};

function valueAtPath(ctx: unknown, path: string): string {
  let node: unknown = ctx;
  for (const key of path.split(".")) {
    if (!node || typeof node !== "object") return "";
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}

function valuesFor(names: string[], ctx: unknown): Record<string, string> {
  const values: Record<string, string> = {};
  names.forEach((name, index) => {
    const value = valueAtPath(ctx, name);
    if (!value) return;
    values[name] = value;
    values[String(index + 1)] = value;
  });
  return values;
}

async function donor(userId: string) {
  const [user, profile] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, phone: true, preferredLang: true, countryCode: true },
    }),
    prisma.donorCommunicationProfile.findUnique({
      where: { userId },
      select: { phone: true, preferredLocale: true, countryCode: true, doNotContact: true, whatsappOptIn: true },
    }).catch(() => null),
  ]);
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    phone: normalizePhoneE164(profile?.phone ?? user.phone),
    locale: profile?.preferredLocale ?? user.preferredLang ?? "ar",
    country: profile?.countryCode ?? user.countryCode ?? null,
    doNotContact: profile?.doNotContact ?? false,
    whatsappOptIn: profile?.whatsappOptIn ?? false,
  };
}

async function latestInboundThread(phone: string | null) {
  if (!phone) return null;
  const variants = phoneMatchVariants(phone);
  if (!variants.length) return null;
  return prisma.communicationProviderEvent.findFirst({
    where: { channel: "WHATSAPP", eventType: "inbound_message", recipient: { in: variants } },
    orderBy: { receivedAt: "desc" },
    select: { senderId: true, receivedAt: true },
  }).catch(() => null);
}

export async function getSmartWhatsappContext(userId: string): Promise<SmartWhatsappContext | null> {
  const d = await donor(userId);
  if (!d) return null;

  const latest = await latestInboundThread(d.phone);
  const convId = d.phone && latest?.senderId ? conversationId(latest.senderId, d.phone) : null;
  const replyWindow = convId
    ? await replyWindowFor(convId)
    : { open: false, lastInboundAt: null, remainingMs: 0, lastInboundMessageId: null };

  const sender = latest?.senderId
    ? await prisma.communicationSender.findUnique({
        where: { id: latest.senderId },
        select: { id: true, name: true, displayName: true, displayPhoneNumber: true },
      }).catch(() => null)
    : null;

  const templates = await prisma.whatsappTemplate.findMany({
    where: {
      OR: [{ category: "MARKETING" }, { purpose: "MARKETING" }, { kind: "CAMPAIGN" }],
      variants: { some: { provider: "META_WHATSAPP", approvalStatus: "APPROVED" } },
    },
    select: { id: true, name: true, category: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  }).catch(() => []);

  return {
    userId,
    phone: d.phone,
    name: d.name,
    locale: d.locale,
    country: d.country,
    doNotContact: d.doNotContact,
    whatsappOptIn: d.whatsappOptIn,
    directSendEnabled: process.env.META_WHATSAPP_DIRECT_SEND_ENABLED === "true",
    conversationId: convId,
    replyWindow,
    sender: sender ? { id: sender.id, name: sender.displayName || sender.name, phone: sender.displayPhoneNumber ?? null } : null,
    marketingTemplates: templates,
  };
}

export type SmartWhatsappSendResult =
  | { ok: true; transport: "FREEFORM" | "DIRECT_SEND" | "MARKETING_TEMPLATE"; deliveryId: string; providerMessageId: string | null }
  | { ok: false; reason: string; detail?: string | null };

export async function sendSmartWhatsapp(input: {
  userId: string;
  mode: SmartWhatsappMode;
  body?: string | null;
  templateId?: string | null;
  actor?: Actor;
}): Promise<SmartWhatsappSendResult> {
  const ctx = await getSmartWhatsappContext(input.userId);
  if (!ctx) return { ok: false, reason: "DONOR_NOT_FOUND" };
  if (!ctx.phone) return { ok: false, reason: "NO_RECIPIENT_PHONE" };

  const body = input.body?.trim() ?? "";
  const locale: SupportedLocale = isValidLocale(ctx.locale) ? ctx.locale : "ar";
  const mode = input.mode === "AUTO"
    ? (ctx.replyWindow.open ? "FREEFORM" : "UTILITY")
    : input.mode;

  if (mode === "FREEFORM") {
    if (!ctx.conversationId || !ctx.replyWindow.open) return { ok: false, reason: "REPLY_WINDOW_CLOSED" };
    if (!body) return { ok: false, reason: "EMPTY_BODY" };
    const sent = await sendConversationReply(ctx.conversationId, body, input.actor);
    return sent.ok
      ? { ok: true, transport: "FREEFORM", deliveryId: sent.deliveryId, providerMessageId: sent.providerMessageId }
      : sent;
  }

  if (ctx.doNotContact) return { ok: false, reason: "DO_NOT_CONTACT" };

  const snapshot = await loadSenderRoutingSnapshot("WHATSAPP");
  const routed = resolveSenderFromSnapshot(snapshot, {
    locale,
    country: ctx.country,
    purpose: mode === "MARKETING" ? "MARKETING" : "UTILITY",
  });
  if (!routed.ok) return { ok: false, reason: routed.reason };
  const sender = routed.sender;
  if (!sender.phoneNumberId) return { ok: false, reason: "META_SENDER_MISSING_PHONE_NUMBER_ID" };

  if (mode === "UTILITY") {
    if (!body) return { ok: false, reason: "EMPTY_BODY" };
    if (!ctx.directSendEnabled) return { ok: false, reason: "META_DIRECT_SEND_DISABLED" };

    const created = await createDeliveryRecord({
      channel: "WHATSAPP",
      provider: "META_WHATSAPP",
      origin: "MANUAL",
      purpose: "UTILITY",
      recipientUserId: ctx.userId,
      recipientName: ctx.name,
      recipientPhone: ctx.phone,
      locale,
      renderedBody: body,
      senderId: sender.id,
      createdBy: input.actor?.actorId ?? null,
      status: "RENDERED",
    });
    if (!created.ok) return { ok: false, reason: "ARCHIVE_FAILED" };

    const runtime = await getActiveMetaWhatsappRuntimeConfig();
    const { sendDirectTextMessage } = await import("./providers/meta-whatsapp/messages");
    const sent = await sendDirectTextMessage({
      phoneNumberId: sender.phoneNumberId,
      to: ctx.phone,
      body,
      category: "utility",
    }, runtime);
    if (!sent.ok) {
      await markDeliveryStatus(created.data.id, "FAILED", { errorMessage: sent.detail ? `${sent.reason}  ${sent.detail}` : sent.reason });
      return { ok: false, reason: sent.reason, detail: sent.detail ?? null };
    }
    await markDeliveryStatus(created.data.id, "SENT", { providerMessageId: sent.providerMessageId });
    await writeAuditLog({
      actorId: input.actor?.actorId ?? undefined,
      actorName: input.actor?.actorName ?? undefined,
      actorRole: input.actor?.actorRole ?? "ADMIN",
      action: "communication.whatsapp.direct-send",
      messageAr: `تم إرسال رسالة خدمة واتساب مباشرة إلى ${ctx.name || ctx.phone}`,
      messageEn: `Direct Send WhatsApp utility message to ${ctx.name || ctx.phone}`,
      entityType: "User",
      entityId: ctx.userId,
      metadata: { deliveryId: created.data.id, transport: "DIRECT_SEND", externalCall: true },
      stream: "TEAM",
    }).catch(() => {});
    return { ok: true, transport: "DIRECT_SEND", deliveryId: created.data.id, providerMessageId: sent.providerMessageId };
  }

  if (mode !== "MARKETING") return { ok: false, reason: "INVALID_MODE" };
  if (!ctx.whatsappOptIn) return { ok: false, reason: "WHATSAPP_MARKETING_OPT_IN_REQUIRED" };
  if (!input.templateId) return { ok: false, reason: "MARKETING_TEMPLATE_REQUIRED" };

  const template = await prisma.whatsappTemplate.findUnique({
    where: { id: input.templateId },
    select: { id: true, provider: true, name: true, variables: true, header: true, category: true, purpose: true, kind: true },
  });
  if (!template) return { ok: false, reason: "TEMPLATE_NOT_FOUND" };
  const category = String(template.category ?? template.purpose ?? "").toUpperCase();
  if (category !== "MARKETING" && template.kind !== "CAMPAIGN") return { ok: false, reason: "MARKETING_TEMPLATE_REQUIRED" };

  const contexts = await loadContextsForUserIds([ctx.userId]);
  const renderCtx = contexts.get(ctx.userId);
  if (!renderCtx) return { ok: false, reason: "CONTEXT_LOAD_FAILED" };
  const rendered = await renderChannelTemplate("WHATSAPP", template.id, locale, renderCtx);
  if (!rendered) return { ok: false, reason: "TEMPLATE_RENDER_FAILED" };

  const mapping = await resolveMetaTemplateMapping(template, locale, sender.businessAccountId);
  if (!mapping) return { ok: false, reason: "META_TEMPLATE_NOT_APPROVED_FOR_SENDER_LANGUAGE" };
  const built = buildMetaComponents({
    componentsSchema: mapping.componentsSchema,
    values: valuesFor(mapping.positionalNames, renderCtx),
    positionalNames: mapping.positionalNames,
    scopedNames: mapping.scopedNames,
    headerMediaUrl: mapping.headerMediaUrl,
    headerMediaFilename: mapping.headerMediaFilename,
    headerLocation: mapping.headerLocation,
  });
  if (!built.ok) return { ok: false, reason: built.reason, detail: built.detail };

  const created = await createDeliveryRecord({
    channel: "WHATSAPP",
    provider: "META_WHATSAPP",
    origin: "MANUAL",
    purpose: "MARKETING",
    templateId: template.id,
    templateName: mapping.name,
    recipientUserId: ctx.userId,
    recipientName: ctx.name,
    recipientPhone: ctx.phone,
    locale: ctx.locale,
    renderedBody: rendered.body,
    senderId: sender.id,
    createdBy: input.actor?.actorId ?? null,
    status: "RENDERED",
  });
  if (!created.ok) return { ok: false, reason: "ARCHIVE_FAILED" };

  const { sendTemplateMessage } = await import("./providers/meta-whatsapp/messages");
  const runtime = await getActiveMetaWhatsappRuntimeConfig();
  const sent = await sendTemplateMessage({
    phoneNumberId: sender.phoneNumberId,
    to: ctx.phone,
    templateName: mapping.name,
    languageCode: mapping.language,
    components: built.components,
  }, runtime);
  if (!sent.ok) {
    await markDeliveryStatus(created.data.id, "FAILED", { errorMessage: sent.detail ? `${sent.reason}  ${sent.detail}` : sent.reason });
    return { ok: false, reason: sent.reason, detail: sent.detail ?? null };
  }
  await markDeliveryStatus(created.data.id, "SENT", { providerMessageId: sent.providerMessageId });
  await writeAuditLog({
    actorId: input.actor?.actorId ?? undefined,
    actorName: input.actor?.actorName ?? undefined,
    actorRole: input.actor?.actorRole ?? "ADMIN",
    action: "communication.whatsapp.marketing-template-send",
    messageAr: `تم إرسال قالب واتساب تسويقي إلى ${ctx.name || ctx.phone}`,
    messageEn: `Marketing WhatsApp template sent to ${ctx.name || ctx.phone}`,
    entityType: "User",
    entityId: ctx.userId,
    metadata: { deliveryId: created.data.id, templateId: template.id, externalCall: true },
    stream: "TEAM",
  }).catch(() => {});
  return { ok: true, transport: "MARKETING_TEMPLATE", deliveryId: created.data.id, providerMessageId: sent.providerMessageId };
}
