import type { CommunicationRuntimeBundle } from "../../runtime-config";
import { getActiveCommunicationRuntimeBundle } from "../../runtime-config";
import { sendNetgsmSms } from "../netgsm/client";
import { isTurkishNumber } from "../netgsm/types";
import { sendBrevoSms } from "../brevo/sms-client";

export const SMS_REASONS = {
  NETGSM_NOT_CONFIGURED: "NETGSM_NOT_CONFIGURED",
  BREVO_NOT_CONFIGURED: "BREVO_SMS_NOT_CONFIGURED",
} as const;

export type SmsProviderId = "NETGSM_SMS" | "BREVO_SMS";
export type SmsRouteResult = { configured: true; provider: SmsProviderId } | { configured: false; provider: SmsProviderId; reason: string };

export function resolveSmsProviderWithRuntime(runtime: CommunicationRuntimeBundle, country?: string | null, phone?: string | null): SmsRouteResult {
  if (isTurkishNumber(phone, country)) {
    return runtime.netgsm.configured
      ? { configured: true, provider: "NETGSM_SMS" }
      : { configured: false, provider: "NETGSM_SMS", reason: runtime.netgsm.reason ?? SMS_REASONS.NETGSM_NOT_CONFIGURED };
  }
  return runtime.brevoSms.configured
    ? { configured: true, provider: "BREVO_SMS" }
    : { configured: false, provider: "BREVO_SMS", reason: runtime.brevoSms.reason ?? SMS_REASONS.BREVO_NOT_CONFIGURED };
}

export async function resolveSmsProvider(country?: string | null, phone?: string | null, runtime?: CommunicationRuntimeBundle): Promise<SmsRouteResult> {
  return resolveSmsProviderWithRuntime(runtime ?? await getActiveCommunicationRuntimeBundle(), country, phone);
}

export async function isSmsConfigured(country?: string | null, phone?: string | null, runtime?: CommunicationRuntimeBundle): Promise<boolean> {
  return (await resolveSmsProvider(country, phone, runtime)).configured;
}

export type SmsSendInput = { to: string; content: string; country?: string | null; sender?: string | null; type?: "transactional" | "marketing"; tag?: string | null };
export type SmsSendResult =
  | { ok: true; provider: SmsProviderId; providerMessageId: string | null; internalAccepted: boolean }
  | { ok: false; provider: SmsProviderId; reason: string; detail?: string };

export async function sendSmsMessage(input: SmsSendInput, runtime?: CommunicationRuntimeBundle): Promise<SmsSendResult> {
  const bundle = runtime ?? await getActiveCommunicationRuntimeBundle();
  const route = resolveSmsProviderWithRuntime(bundle, input.country, input.to);
  if (!route.configured) return { ok: false, provider: route.provider, reason: route.reason };
  if (route.provider === "NETGSM_SMS") {
    const res = await sendNetgsmSms({ to: input.to, content: input.content }, input.country, bundle.netgsm);
    return res.ok
      ? { ok: true, provider: "NETGSM_SMS", providerMessageId: res.providerMessageId, internalAccepted: res.internalAccepted }
      : { ok: false, provider: "NETGSM_SMS", reason: res.reason, detail: res.detail };
  }
  const res = await sendBrevoSms({ to: input.to, content: input.content, sender: input.sender, type: input.type, tag: input.tag }, bundle.brevoSms);
  return res.ok
    ? { ok: true, provider: "BREVO_SMS", providerMessageId: res.providerMessageId, internalAccepted: res.internalAccepted }
    : { ok: false, provider: "BREVO_SMS", reason: res.reason, detail: res.detail };
}
