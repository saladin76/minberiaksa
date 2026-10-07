import "server-only";

import { prisma } from "@/lib/prisma";
import { createDeliveryRecord, markDeliveryStatus } from "./delivery-log-service";
import { conversationId } from "./conversation-service";
import { replyWindowFor, sendConversationReply } from "./conversation-reply-service";
import { normalizePhoneE164, phoneMatchVariants } from "./phone";
import { loadSenderRoutingSnapshot, resolveSenderFromSnapshot, type ResolvedSender } from "./sender-resolution";
import { getActiveMetaWhatsappRuntimeConfig } from "./runtime-config";
import { loadContextForDonation, loadContextsForUserIds, type TemplateContext } from "@/lib/templates/variables";
import { renderChannelTemplate } from "./template-compat";
import { resolveMetaTemplateMapping } from "./automatic-message-dispatcher";
import { buildMetaComponents } from "./providers/meta-whatsapp/parameters";
import { isValidLocale, type SupportedLocale } from "@/lib/locales";
import { writeAuditLog } from "@/lib/audit-log";
import { touchProfileCommunication } from "./donor-communication-profile-service";

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
  utilityTemplates: Array<{ id: string; name: string; category: string | null }>;
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

  const [marketingTemplates, utilityTemplates] = await Promise.all([
    prisma.whatsappTemplate.findMany({
      where: {
        status: { not: "ARCHIVED" },
        OR: [{ category: "MARKETING" }, { purpose: "MARKETING" }, { kind: "CAMPAIGN" }],
        variants: { some: { provider: "META_WHATSAPP", approvalStatus: "APPROVED", category: "MARKETING" } },
      },
      select: { id: true, name: true, category: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }).catch(() => []),
    prisma.whatsappTemplate.findMany({
      where: {
        status: { not: "ARCHIVED" },
        OR: [{ category: "UTILITY" }, { purpose: "UTILITY" }, { purpose: "TRANSACTIONAL" }],
        variants: { some: { provider: "META_WHATSAPP", approvalStatus: "APPROVED", category: "UTILITY" } },
      },
      select: { id: true, name: true, category: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }).catch(() => []),
  ]);

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
    marketingTemplates,
    utilityTemplates,
  };
}

export type SmartWhatsappSendResult =
  | { ok: true; transport: "FREEFORM" | "DIRECT_SEND" | "UTILITY_TEMPLATE_FALLBACK" | "MARKETING_TEMPLATE"; deliveryId: string; providerMessageId: string | null }
  | { ok: false; reason: string; detail?: string | null };

async function sendApprovedTemplateForDonor(args: {
  templateId: string;
  expected: "UTILITY" | "MARKETING";
  ctx: SmartWhatsappContext;
  locale: SupportedLocale;
  sender: ResolvedSender;
  actor?: Actor;
}): Promise<SmartWhatsappSendResult> {
  const template = await prisma.whatsappTemplate.findUnique({
    where: { id: args.templateId },
    select: { id: true, provider: true, name: true, variables: true, header: true, category: true, purpose: true, kind: true },
  });
  if (!template) return { ok: false, reason: "TEMPLATE_NOT_FOUND" };

  const category = String(template.category ?? template.purpose ?? "").toUpperCase();
  if (args.expected === "MARKETING") {
    if (category !== "MARKETING" && template.kind !== "CAMPAIGN") return { ok: false, reason: "MARKETING_TEMPLATE_REQUIRED" };
  } else if (!["UTILITY", "TRANSACTIONAL"].includes(category)) {
    return { ok: false, reason: "UTILITY_TEMPLATE_REQUIRED" };
  }

  const contexts = await loadContextsForUserIds([args.ctx.userId]);
  let renderCtx: TemplateContext | undefined = contexts.get(args.ctx.userId);
  if (!renderCtx) return { ok: false, reason: "CONTEXT_LOAD_FAILED" };

  // Transactional Meta templates often depend on {{donation.*}}. A donor-profile send previously
  // loaded only user + PAID-history context, so choosing donation_failed from the Smart WhatsApp
  // dialog could never supply donation.amount/currency/title. Resolve the template's enabled
  // trigger and focus the latest matching donation before rendering. This keeps manual resend/test
  // behavior aligned with the automatic event path without asking operators to understand variables.
  const variableRows = Array.isArray(template.variables) ? template.variables : [];
  const needsDonationContext = variableRows.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const key = String((entry as { key?: unknown }).key ?? "");
    return key === "donation" || key.startsWith("donation.");
  });
  if (needsDonationContext) {
    const trigger = await prisma.messageTrigger.findFirst({
      where: { templateId: template.id, enabled: true },
      select: { event: true },
    }).catch(() => null);
    const event = String(trigger?.event ?? "");
    const status =
      event === "DONATION_FAILED" ? "FAILED"
      : ["DONATION_PAID", "FIRST_DONATION", "SUBSCRIPTION_PAYMENT"].includes(event) ? "PAID"
      : null;
    const focus = await prisma.donation.findFirst({
      where: {
        donorId: args.ctx.userId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }).catch(() => null);
    if (focus?.id) {
      const focused = await loadContextForDonation(focus.id);
      if (focused) renderCtx = focused;
    }
  }

  const rendered = await renderChannelTemplate("WHATSAPP", template.id, args.locale, renderCtx);
  if (!rendered) return { ok: false, reason: "TEMPLATE_RENDER_FAILED" };

  const mapping = await resolveMetaTemplateMapping(template, args.locale, args.sender.businessAccountId);
  if (!mapping) return { ok: false, reason: "META_TEMPLATE_NOT_APPROVED_FOR_SENDER_LANGUAGE" };
  const providerCategory = String(mapping.category ?? "").toUpperCase();
  if (providerCategory && providerCategory !== args.expected) {
    return { ok: false, reason: "META_TEMPLATE_CATEGORY_MISMATCH", detail: `Meta: ${providerCategory} · Expected: ${args.expected}` };
  }
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
    purpose: args.expected,
    templateId: template.id,
    templateName: mapping.name,
    recipientUserId: args.ctx.userId,
    recipientName: args.ctx.name,
    recipientPhone: args.ctx.phone,
    locale: args.locale,
    renderedBody: rendered.body,
    variables: { snapshot: renderCtx } as never,
    senderId: args.sender.id,
    createdBy: args.actor?.actorId ?? null,
    status: "RENDERED",
  });
  if (!created.ok) return { ok: false, reason: "ARCHIVE_FAILED" };

  const { sendTemplateMessage } = await import("./providers/meta-whatsapp/messages");
  const runtime = await getActiveMetaWhatsappRuntimeConfig();
  const sent = await sendTemplateMessage({
    phoneNumberId: args.sender.phoneNumberId!,
    to: args.ctx.phone!,
    templateName: mapping.name,
    languageCode: mapping.language,
    components: built.components,
  }, runtime);

  if (!sent.ok) {
    await markDeliveryStatus(created.data.id, "FAILED", { errorMessage: sent.detail ? `${sent.reason}  ${sent.detail}` : sent.reason });
    return { ok: false, reason: sent.reason, detail: sent.detail ?? null };
  }

  await markDeliveryStatus(created.data.id, "SENT", { providerMessageId: sent.providerMessageId });
  await touchProfileCommunication(args.ctx.userId, "WHATSAPP");
  await writeAuditLog({
    actorId: args.actor?.actorId ?? undefined,
    actorName: args.actor?.actorName ?? undefined,
    actorRole: args.actor?.actorRole ?? "ADMIN",
    action: args.expected === "MARKETING"
      ? "communication.whatsapp.marketing-template-send"
      : "communication.whatsapp.utility-template-fallback",
    messageAr: args.expected === "MARKETING"
      ? `تم إرسال قالب واتساب تسويقي إلى ${args.ctx.name || args.ctx.phone}`
      : `تم إرسال قالب واتساب خدمي احتياطي إلى ${args.ctx.name || args.ctx.phone}`,
    messageEn: args.expected === "MARKETING"
      ? `Marketing WhatsApp template sent to ${args.ctx.name || args.ctx.phone}`
      : `Utility WhatsApp fallback template sent to ${args.ctx.name || args.ctx.phone}`,
    entityType: "User",
    entityId: args.ctx.userId,
    metadata: { deliveryId: created.data.id, templateId: template.id, fallback: args.expected === "UTILITY", externalCall: true },
    stream: "TEAM",
  }).catch(() => {});

  return {
    ok: true,
    transport: args.expected === "MARKETING" ? "MARKETING_TEMPLATE" : "UTILITY_TEMPLATE_FALLBACK",
    deliveryId: created.data.id,
    providerMessageId: sent.providerMessageId,
  };
}

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
    let directFailure: { reason: string; detail?: string | null } | null = null;

    if (ctx.directSendEnabled) {
      if (!body) return { ok: false, reason: "EMPTY_BODY" };

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

      if (sent.ok) {
        await markDeliveryStatus(created.data.id, "SENT", { providerMessageId: sent.providerMessageId });
        await touchProfileCommunication(ctx.userId, "WHATSAPP");
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

      directFailure = { reason: sent.reason, detail: sent.detail ?? null };
      await markDeliveryStatus(created.data.id, "FAILED", {
        errorMessage: sent.detail ? `${sent.reason}  ${sent.detail}` : sent.reason,
      });
    } else {
      directFailure = { reason: "META_DIRECT_SEND_DISABLED" };
    }

    // Direct Send is beta. A pre-approved Utility template is the deterministic fallback so a
    // service conversation can still start when the beta is disabled or Meta rejects a Direct Send.
    if (input.templateId) {
      const fallback = await sendApprovedTemplateForDonor({
        templateId: input.templateId,
        expected: "UTILITY",
        ctx,
        locale,
        sender,
        actor: input.actor,
      });
      if (fallback.ok) return fallback;
      return {
        ok: false,
        reason: fallback.reason,
        detail: [
          directFailure ? `Direct Send: ${directFailure.reason}${directFailure.detail ? ` — ${directFailure.detail}` : ""}` : null,
          fallback.detail,
        ].filter(Boolean).join(" | ") || null,
      };
    }

    return {
      ok: false,
      reason: directFailure?.reason ?? "UTILITY_TEMPLATE_REQUIRED",
      detail: directFailure?.detail ?? "اختر قالب Utility معتمد كمسار احتياطي.",
    };
  }

  if (mode !== "MARKETING") return { ok: false, reason: "INVALID_MODE" };
  if (!input.templateId) return { ok: false, reason: "MARKETING_TEMPLATE_REQUIRED" };

  return sendApprovedTemplateForDonor({
    templateId: input.templateId,
    expected: "MARKETING",
    ctx,
    locale,
    sender,
    actor: input.actor,
  });
}
