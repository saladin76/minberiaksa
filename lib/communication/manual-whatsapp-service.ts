import "server-only";

import { prisma } from "@/lib/prisma";
import { loadContext, mergeText } from "@/lib/templates/variables";
import { pickLocale, resolveWhatsappBody } from "@/lib/templates/locale-resolver";
import { contactChannelEligibility } from "./consent-eligibility";
import { getProfile, upsertProfileForUser, touchProfileCommunication } from "./donor-communication-profile-service";
import { createDeliveryRecord, markDeliveryStatus, recordSkippedDelivery } from "./delivery-log-service";
import { resolveSenderForSend } from "./sender-resolution";
import { resolveMetaTemplateMapping } from "./automatic-message-dispatcher";
import { buildMetaComponents } from "./providers/meta-whatsapp/parameters";
import { sendPreparedDelivery } from "./provider-router";
import { normalizePhoneE164 } from "./phone";
import { logSentMessage } from "@/lib/messaging/log-sent";
import { conversationId } from "./conversation-service";
import type { CommunicationPurposeId } from "./communication-runtime-types";
import type { SupportedLocale } from "@/lib/locales";

type Actor = { actorId?: string | null; actorName?: string | null } | null;

export type ManualWhatsappSendResult =
  | {
      ok: true;
      deliveryId: string;
      providerMessageId: string | null;
      senderId: string | null;
      senderPhone: string | null;
      locale: string;
      conversationId: string;
    }
  | { ok: false; status: number; reason: string; detail?: string | null };

function routingPurpose(template: { category?: string | null; purpose?: string | null }): CommunicationPurposeId {
  const raw = String(template.category ?? template.purpose ?? "UTILITY").toUpperCase();
  if (raw === "MARKETING" || raw === "AUTHENTICATION" || raw === "UTILITY" || raw === "TRANSACTIONAL") {
    return raw as CommunicationPurposeId;
  }
  return "UTILITY";
}

function consentPurpose(purpose: CommunicationPurposeId): "MARKETING" | "TRANSACTIONAL" {
  return purpose === "MARKETING" ? "MARKETING" : "TRANSACTIONAL";
}

function valuesForMetaTemplate(
  mapping: NonNullable<Awaited<ReturnType<typeof resolveMetaTemplateMapping>>>,
  ctx: NonNullable<Awaited<ReturnType<typeof loadContext>>>,
): Record<string, string> {
  const values: Record<string, string> = {};
  const semanticNames = new Set<string>([
    ...mapping.positionalNames,
    ...Object.values(mapping.scopedNames),
  ]);
  for (const name of semanticNames) {
    values[name] = mergeText(`{{${name}}}`, ctx);
  }
  mapping.positionalNames.forEach((name, index) => {
    values[String(index + 1)] = values[name] ?? mergeText(`{{${name}}}`, ctx);
  });
  return values;
}

async function mirrorManual(input: {
  status: "SENT" | "FAILED" | "SKIPPED";
  templateId: string;
  templateName: string;
  locale: string;
  userId: string;
  recipientName: string | null;
  recipientPhone: string | null;
  renderedBody: string;
  variables: Record<string, unknown>;
  errorMessage?: string | null;
  providerMessageId?: string | null;
  actor?: Actor;
}) {
  await logSentMessage({
    channel: "WHATSAPP",
    origin: "MANUAL",
    status: input.status,
    templateId: input.templateId,
    templateName: input.templateName,
    locale: input.locale,
    recipientUserId: input.userId,
    recipientPhone: input.recipientPhone,
    recipientName: input.recipientName,
    renderedBody: input.renderedBody,
    variables: input.variables as never,
    errorMessage: input.errorMessage ?? null,
    providerMessageId: input.providerMessageId ?? null,
    actorId: input.actor?.actorId ?? null,
    actorName: input.actor?.actorName ?? null,
  });
}

/**
 * One operator-initiated WhatsApp template send to one donor.
 *
 * The same routing engine used by campaigns and triggers selects the business number. The selected
 * WABA must itself have an approved variant of the chosen template; approval on another WABA never
 * authorizes this sender. A successful delivery is therefore enough to open the exact
 * sender+recipient conversation and every later inbox reply stays on that same business number.
 */
export async function sendManualWhatsappTemplate(input: {
  userId: string;
  templateId: string;
  localeOverride?: string | null;
  actor?: Actor;
}): Promise<ManualWhatsappSendResult> {
  const [ctx, template] = await Promise.all([
    loadContext(input.userId),
    prisma.whatsappTemplate.findUnique({ where: { id: input.templateId } }),
  ]);
  if (!ctx) return { ok: false, status: 404, reason: "RECIPIENT_NOT_FOUND" };
  if (!template) return { ok: false, status: 404, reason: "TEMPLATE_NOT_FOUND" };

  const recipientPhone = normalizePhoneE164(ctx.user.phone);
  const locale = pickLocale({
    override: input.localeOverride,
    recipientLang: ctx.user.preferredLang,
  });
  const variant = resolveWhatsappBody(template, locale);
  const renderedBody = mergeText(variant.body, ctx);
  const variables = ctx as unknown as Record<string, unknown>;
  const purpose = routingPurpose(template);

  if (!recipientPhone) {
    await recordSkippedDelivery({
      channel: "WHATSAPP",
      provider: "META_WHATSAPP",
      origin: "MANUAL",
      purpose,
      templateId: template.id,
      templateName: template.name,
      recipientUserId: ctx.user.id,
      recipientName: ctx.user.name || null,
      recipientPhone: null,
      locale,
      renderedBody,
      variables,
      createdBy: input.actor?.actorId ?? null,
    }, "NO_RECIPIENT_PHONE");
    await mirrorManual({
      status: "SKIPPED", templateId: template.id, templateName: template.name, locale,
      userId: ctx.user.id, recipientName: ctx.user.name || null, recipientPhone: null,
      renderedBody, variables, errorMessage: "NO_RECIPIENT_PHONE", actor: input.actor,
    });
    return { ok: false, status: 422, reason: "NO_RECIPIENT_PHONE" };
  }

  let profile = await getProfile(input.userId);
  if (!profile) {
    const synced = await upsertProfileForUser(input.userId);
    profile = synced.ok ? synced.data : null;
  }
  const eligibility = contactChannelEligibility(
    profile ? {
      contactId: profile.id,
      emailOptIn: profile.emailOptIn,
      smsOptIn: profile.smsOptIn,
      whatsappOptIn: profile.whatsappOptIn,
      preferredLanguage: profile.preferredLocale,
      countryCode: profile.countryCode,
      doNotContact: profile.doNotContact,
      consentSource: profile.consentSource,
      lastConsentAt: profile.lastConsentAt?.toISOString() ?? null,
    } : null,
    "WHATSAPP",
    consentPurpose(purpose),
  );
  if (!eligibility.eligible) {
    await recordSkippedDelivery({
      channel: "WHATSAPP",
      provider: "META_WHATSAPP",
      origin: "MANUAL",
      purpose,
      templateId: template.id,
      templateName: template.name,
      recipientUserId: ctx.user.id,
      recipientName: ctx.user.name || null,
      recipientPhone,
      locale,
      renderedBody,
      variables,
      createdBy: input.actor?.actorId ?? null,
    }, "WHATSAPP_CONSENT_REQUIRED");
    await mirrorManual({
      status: "SKIPPED", templateId: template.id, templateName: template.name, locale,
      userId: ctx.user.id, recipientName: ctx.user.name || null, recipientPhone,
      renderedBody, variables, errorMessage: `WHATSAPP_CONSENT_REQUIRED: ${eligibility.reason}`, actor: input.actor,
    });
    return { ok: false, status: 409, reason: "WHATSAPP_CONSENT_REQUIRED", detail: eligibility.reason };
  }

  const routed = await resolveSenderForSend("WHATSAPP", {
    locale,
    country: ctx.user.countryCode || null,
    purpose,
  });
  if (!routed.ok) {
    await recordSkippedDelivery({
      channel: "WHATSAPP",
      provider: "META_WHATSAPP",
      origin: "MANUAL",
      purpose,
      templateId: template.id,
      templateName: template.name,
      recipientUserId: ctx.user.id,
      recipientName: ctx.user.name || null,
      recipientPhone,
      locale,
      renderedBody,
      variables,
      createdBy: input.actor?.actorId ?? null,
    }, routed.reason);
    return { ok: false, status: 409, reason: routed.reason };
  }

  if (!routed.sender.phoneNumberId) {
    return { ok: false, status: 409, reason: "META_SENDER_MISSING_PHONE_NUMBER_ID" };
  }

  const mapping = await resolveMetaTemplateMapping(template, locale, routed.sender.businessAccountId);
  if (!mapping) {
    const reason = "META_TEMPLATE_NOT_APPROVED_FOR_ROUTED_WABA";
    await recordSkippedDelivery({
      channel: "WHATSAPP",
      provider: "META_WHATSAPP",
      senderId: routed.sender.id,
      origin: "MANUAL",
      purpose,
      templateId: template.id,
      templateName: template.name,
      recipientUserId: ctx.user.id,
      recipientName: ctx.user.name || null,
      recipientPhone,
      locale,
      renderedBody,
      variables,
      createdBy: input.actor?.actorId ?? null,
    }, reason);
    await mirrorManual({
      status: "SKIPPED", templateId: template.id, templateName: template.name, locale,
      userId: ctx.user.id, recipientName: ctx.user.name || null, recipientPhone,
      renderedBody, variables, errorMessage: reason, actor: input.actor,
    });
    return {
      ok: false,
      status: 409,
      reason,
      detail: "القالب ليس معتمدًا على WABA الخاصة بالرقم الذي اختاره التوجيه لهذه اللغة/الدولة.",
    };
  }

  const built = buildMetaComponents({
    componentsSchema: mapping.componentsSchema,
    values: valuesForMetaTemplate(mapping, ctx),
    positionalNames: mapping.positionalNames,
    scopedNames: mapping.scopedNames,
    headerMediaUrl: mapping.headerMediaUrl,
    headerMediaFilename: mapping.headerMediaFilename,
    headerLocation: mapping.headerLocation,
  });
  if (!built.ok) {
    const reason = `${built.reason}: ${built.detail}`;
    await recordSkippedDelivery({
      channel: "WHATSAPP",
      provider: "META_WHATSAPP",
      senderId: routed.sender.id,
      origin: "MANUAL",
      purpose,
      templateId: template.id,
      templateName: template.name,
      recipientUserId: ctx.user.id,
      recipientName: ctx.user.name || null,
      recipientPhone,
      locale,
      renderedBody,
      variables,
      createdBy: input.actor?.actorId ?? null,
    }, reason);
    return { ok: false, status: 422, reason: built.reason, detail: built.detail };
  }

  const created = await createDeliveryRecord({
    channel: "WHATSAPP",
    provider: "META_WHATSAPP",
    senderId: routed.sender.id,
    origin: "MANUAL",
    purpose,
    templateId: template.id,
    templateName: template.name,
    recipientUserId: ctx.user.id,
    recipientName: ctx.user.name || null,
    recipientPhone,
    locale,
    renderedBody,
    variables,
    createdBy: input.actor?.actorId ?? null,
    status: "RENDERED",
  });
  if (!created.ok) return { ok: false, status: 500, reason: "ARCHIVE_FAILED" };

  const sent = await sendPreparedDelivery({
    channel: "WHATSAPP",
    sender: { provider: "META_WHATSAPP", phoneNumberId: routed.sender.phoneNumberId },
    to: recipientPhone,
    templateName: mapping.name,
    languageCode: mapping.language,
    components: built.components,
  });
  if (!sent.ok) {
    const errorMessage = sent.detail ? `${sent.reason} — ${sent.detail}` : sent.reason;
    await markDeliveryStatus(created.data.id, "FAILED", { errorMessage });
    await mirrorManual({
      status: "FAILED", templateId: template.id, templateName: template.name, locale,
      userId: ctx.user.id, recipientName: ctx.user.name || null, recipientPhone,
      renderedBody, variables, errorMessage, actor: input.actor,
    });
    return { ok: false, status: 502, reason: sent.reason, detail: sent.detail ?? null };
  }

  await markDeliveryStatus(created.data.id, "SENT", {
    providerMessageId: sent.providerMessageId,
    internalAccepted: sent.internalAccepted,
  });
  await mirrorManual({
    status: "SENT", templateId: template.id, templateName: template.name, locale,
    userId: ctx.user.id, recipientName: ctx.user.name || null, recipientPhone,
    renderedBody, variables, providerMessageId: sent.providerMessageId, actor: input.actor,
  });
  await touchProfileCommunication(input.userId, "WHATSAPP");

  return {
    ok: true,
    deliveryId: created.data.id,
    providerMessageId: sent.providerMessageId,
    senderId: routed.sender.id,
    senderPhone: routed.sender.displayPhoneNumber,
    locale: mapping.resolvedLocale ?? variant.resolvedLocale,
    conversationId: conversationId(routed.sender.id, recipientPhone),
  };
}
