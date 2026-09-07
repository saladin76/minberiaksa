import type { CommunicationChannelId } from "./communication-runtime-types";
import { getActiveCommunicationRuntimeBundle, type CommunicationRuntimeBundle } from "./runtime-config";
import { META_REASONS } from "./providers/meta-whatsapp/errors";
import { EMAIL_REASONS, EMAIL_PROVIDER_ID } from "./providers/email/client";
import { resolveSmsProviderWithRuntime, sendSmsMessage } from "./providers/sms/client";

export type ProviderSendDecision =
  | { canSend: false; reason: string }
  | { canSend: true; providerId: string };

export type RouterSender = { provider?: string | null; phoneNumberId?: string | null; senderEmail?: string | null; smsSender?: string | null };
export type RouterContext = { country?: string | null; phone?: string | null };

export function providerNotConfiguredReason(channel: CommunicationChannelId): string {
  if (channel === "WHATSAPP") return META_REASONS.NOT_CONFIGURED;
  if (channel === "EMAIL") return EMAIL_REASONS.NOT_CONFIGURED;
  return "SMS_PROVIDER_NOT_CONFIGURED";
}

export function resolveProviderForSendWithRuntime(
  runtime: CommunicationRuntimeBundle,
  channel: CommunicationChannelId,
  sender?: RouterSender | null,
  ctx?: RouterContext
): ProviderSendDecision {
  if (channel === "WHATSAPP") {
    if (!runtime.meta.configured) return { canSend: false, reason: runtime.meta.reason ?? META_REASONS.NOT_CONFIGURED };
    if (!sender?.phoneNumberId && !runtime.meta.values.defaultPhoneNumberId) return { canSend: false, reason: META_REASONS.SENDER_MISSING_PHONE_NUMBER_ID };
    return { canSend: true, providerId: "META_WHATSAPP" };
  }
  if (channel === "EMAIL") {
    if (!runtime.elasticEmail.configured) return { canSend: false, reason: runtime.elasticEmail.reason ?? EMAIL_REASONS.NOT_CONFIGURED };
    if (!sender?.senderEmail && !runtime.elasticEmail.values.senderEmail) return { canSend: false, reason: EMAIL_REASONS.SENDER_MISSING_IDENTITY };
    return { canSend: true, providerId: EMAIL_PROVIDER_ID };
  }
  const sms = resolveSmsProviderWithRuntime(runtime, ctx?.country, ctx?.phone);
  if (!sms.configured) return { canSend: false, reason: sms.reason };
  return { canSend: true, providerId: sms.provider };
}

export async function resolveProviderForSend(channel: CommunicationChannelId, sender?: RouterSender | null, ctx?: RouterContext, runtime?: CommunicationRuntimeBundle): Promise<ProviderSendDecision> {
  return resolveProviderForSendWithRuntime(runtime ?? await getActiveCommunicationRuntimeBundle(), channel, sender, ctx);
}

export async function isSendEnabled(channel: CommunicationChannelId, runtime?: CommunicationRuntimeBundle): Promise<boolean> {
  const bundle = runtime ?? await getActiveCommunicationRuntimeBundle();
  if (channel === "WHATSAPP") return bundle.meta.configured;
  if (channel === "EMAIL") return bundle.elasticEmail.configured;
  return bundle.netgsm.configured || bundle.brevoSms.configured;
}

export type PreparedSendInput = {
  channel: CommunicationChannelId;
  sender?: RouterSender | null;
  country?: string | null;
  to: string;
  templateName?: string | null;
  languageCode?: string | null;
  components?: unknown[];
  subject?: string | null;
  html?: string | null;
  text?: string | null;
};

export type PreparedSendResult =
  | { ok: true; provider: string; providerMessageId: string | null; internalAccepted: boolean }
  | { ok: false; provider?: string; reason: string; detail?: string };

export async function sendPreparedDelivery(input: PreparedSendInput, runtime?: CommunicationRuntimeBundle): Promise<PreparedSendResult> {
  const bundle = runtime ?? await getActiveCommunicationRuntimeBundle();
  const decision = resolveProviderForSendWithRuntime(bundle, input.channel, input.sender, { country: input.country, phone: input.to });
  if (!decision.canSend) return { ok: false, reason: decision.reason };

  if (input.channel === "WHATSAPP") {
    if (!input.templateName || !input.languageCode) return { ok: false, reason: "META_TEMPLATE_REQUIRED" };
    const { sendTemplateMessage } = await import("./providers/meta-whatsapp/messages");
    const res = await sendTemplateMessage({
      phoneNumberId: input.sender?.phoneNumberId || (bundle.meta.configured ? bundle.meta.values.defaultPhoneNumberId : ""),
      to: input.to,
      templateName: input.templateName,
      languageCode: input.languageCode,
      components: input.components,
    }, bundle.meta);
    if (!res.ok) return { ok: false, provider: "META_WHATSAPP", reason: res.reason, detail: res.detail };
    return { ok: true, provider: "META_WHATSAPP", providerMessageId: res.providerMessageId, internalAccepted: false };
  }

  if (input.channel === "EMAIL") {
    const { sendEmailMessage } = await import("./providers/email/client");
    const res = await sendEmailMessage({
      to: input.to,
      subject: input.subject ?? "",
      html: input.html ?? "",
      text: input.text,
      senderEmail: input.sender?.senderEmail,
    }, bundle.elasticEmail);
    if (!res.ok) return { ok: false, provider: EMAIL_PROVIDER_ID, reason: res.reason, detail: res.detail };
    return { ok: true, provider: res.providerId, providerMessageId: res.providerMessageId, internalAccepted: res.internalAccepted };
  }

  const res = await sendSmsMessage({ to: input.to, content: input.html ?? input.subject ?? "", country: input.country, sender: input.sender?.smsSender, tag: "communication" }, bundle);
  if (!res.ok) return { ok: false, provider: res.provider, reason: res.reason, detail: res.detail };
  return { ok: true, provider: res.provider, providerMessageId: res.providerMessageId, internalAccepted: res.internalAccepted };
}
