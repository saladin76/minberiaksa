import "server-only";
import { prisma } from "@/lib/prisma";
import { createDeliveryRecord, markDeliveryStatus } from "@/lib/communication/delivery-log-service";
import { conversationId } from "@/lib/communication/conversation-service";
import { replyWindowFor } from "@/lib/communication/conversation-reply-service";
import { phoneMatchVariants } from "@/lib/communication/phone";
import { isWhatsappExplicitlyUnsubscribed } from "@/lib/communication/campaign-audience-accounting";
import { sendTextMessage, sendTemplateMessage } from "@/lib/communication/providers/meta-whatsapp/messages";
import { resolveMetaTemplateMapping } from "@/lib/communication/automatic-message-dispatcher";
import { buildMetaComponents } from "@/lib/communication/providers/meta-whatsapp/parameters";
import type { ResolvedSender } from "@/lib/communication/sender-resolution";
import { GIFT_WHATSAPP_TEMPLATE, GIFT_WHATSAPP_SUCCESSOR } from "./gift-template-draft";
import { normalizeGiftPhone } from "./gift-order";

export async function sendGiftWhatsapp(input: {
  phone: string; name: string; locale: string; body: string; itemId: string;
  values: Record<string, string>; sender: ResolvedSender;
  templateName?: string; templateRequiredReason?: string;
  archiveVariables?: Record<string, unknown>; origin?: "MANUAL" | "TRIGGER";
  attachment?: { pdf: Buffer; filename: string };
}): Promise<{ ok: true; providerMessageId: string | null } | { ok: false; reason: string; uncertain?: boolean }> {
  if (!input.sender.phoneNumberId) return { ok: false, reason: "SENDER_MISSING_PHONE_NUMBER_ID" };
  const to = normalizeGiftPhone(input.phone);
  if (!to) return { ok: false, reason: "GIFT_RECIPIENT_PHONE_INVALID" };
  const profiles = await prisma.donorCommunicationProfile.findMany({ where: { phone: { in: phoneMatchVariants(to) } } });
  if (profiles.some(p => p.doNotContact || isWhatsappExplicitlyUnsubscribed(p))) return { ok: false, reason: "RECIPIENT_UNSUBSCRIBED" };
  const window = await replyWindowFor(conversationId(input.sender.id, to));
  let template: { id: string; name: string } | null = null;
  let mapping: Awaited<ReturnType<typeof resolveMetaTemplateMapping>> = null;
  if (!window.open) {
    for (const name of input.templateName ? [input.templateName] : [GIFT_WHATSAPP_SUCCESSOR, GIFT_WHATSAPP_TEMPLATE]) {
      const candidate = await prisma.whatsappTemplate.findFirst({ where: { name, OR: [{ status: { not: "ARCHIVED" } }, { status: null }, { status: { isSet: false } }] }, select: { id: true, name: true } });
      if (!candidate) continue;
      template ??= candidate;
      const ready = await resolveMetaTemplateMapping(candidate, input.locale, input.sender.businessAccountId, { exactLanguage: true });
      if (ready) { template = candidate; mapping = ready; break; }
    }
  }
  const created = await createDeliveryRecord({ channel: "WHATSAPP", provider: "META_WHATSAPP", senderId: input.sender.id,
    origin: input.origin ?? "TRIGGER", purpose: "TRANSACTIONAL", recipientPhone: to, recipientName: input.name, locale: input.locale,
    templateId: template?.id, templateName: mapping?.name, renderedBody: input.body, variables: input.archiveVariables ?? { giftItemId: input.itemId, snapshot: { gift: input.values } }, status: "RENDERED" });
  if (!created.ok) return { ok: false, reason: "ARCHIVE_FAILED" };
  const skip = async (reason: string) => { await markDeliveryStatus(created.data.id, "SKIPPED", { errorMessage: reason }); return { ok: false as const, reason }; };
  if (!window.open && !mapping) return skip(input.templateRequiredReason ?? "GIFT_TEMPLATE_APPROVAL_REQUIRED");
  const built = mapping ? buildMetaComponents({ componentsSchema: mapping.componentsSchema, values: input.values, positionalNames: mapping.positionalNames, scopedNames: mapping.scopedNames, headerMediaUrl: mapping.headerMediaUrl, headerMediaFilename: mapping.headerMediaFilename, headerLocation: mapping.headerLocation }) : null;
  if (built && !built.ok) return skip(built.reason);
  const sendAttachment = async () => {
    const { getMetaConfig } = await import("@/lib/communication/providers/meta-whatsapp/client");
    const { uploadMessageMedia, sendMediaMessage } = await import("@/lib/communication/providers/meta-whatsapp/media-messages");
    const config = await getMetaConfig();
    if (!config) return { ok: false as const, reason: "META_NOT_CONFIGURED" };
    const attachment = input.attachment!;
    const uploaded = await uploadMessageMedia(config, input.sender.phoneNumberId!, new Blob([new Uint8Array(attachment.pdf)], { type: "application/pdf" }), attachment.filename);
    if (!uploaded.ok) return uploaded;
    return sendMediaMessage(config, { phoneNumberId: input.sender.phoneNumberId!, to, kind: "document", id: uploaded.id, filename: attachment.filename, caption: input.body });
  };
  const sent = window.open && input.attachment ? await sendAttachment() : window.open
    ? await sendTextMessage({ phoneNumberId: input.sender.phoneNumberId, to, body: input.body })
    : await sendTemplateMessage({ phoneNumberId: input.sender.phoneNumberId, to, templateName: mapping!.name, languageCode: mapping!.language, components: built && built.ok ? built.components : [] });
  if (!sent.ok) {
    const uncertain = /REQUEST_FAILED|INVALID_RESPONSE|HTTP_5\d\d|MEDIA_SEND_UNCONFIRMED/.test(sent.reason);
    await markDeliveryStatus(created.data.id, "FAILED", { errorMessage: uncertain ? "DELIVERY_OUTCOME_UNCERTAIN" : sent.reason });
    return { ok: false, reason: sent.reason, uncertain };
  }
  await markDeliveryStatus(created.data.id, "SENT", { providerMessageId: sent.providerMessageId });
  return { ok: true, providerMessageId: sent.providerMessageId };
}
