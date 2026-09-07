import { brevoSmsDefaultType } from "../../provider-env";
import { getActiveBrevoSmsRuntimeConfig, RUNTIME_FAILURE, type ActiveRuntimeConfig, type BrevoSmsRuntimeValues } from "../../runtime-config";
import { BREVO_SMS_REASONS, mapBrevoError, scrubBrevo } from "./errors";
import type { BrevoSmsInput, BrevoSendResult } from "./types";

const BREVO_SMS_ENDPOINT = "https://api.brevo.com/v3/transactionalSMS/sms";
export type BrevoSmsRuntimeConfig = ActiveRuntimeConfig<BrevoSmsRuntimeValues>;

function failureReason(cfg: BrevoSmsRuntimeConfig): string {
  if (cfg.configured) return BREVO_SMS_REASONS.NOT_CONFIGURED;
  if (cfg.reason === RUNTIME_FAILURE.PROVIDER_DISABLED) return "PROVIDER_DISABLED";
  if (cfg.reason === RUNTIME_FAILURE.INTEGRATION_DECRYPTION_FAILED) return "INTEGRATION_DECRYPTION_FAILED";
  if (cfg.reason === RUNTIME_FAILURE.INTEGRATION_DATABASE_UNAVAILABLE) return "INTEGRATION_DATABASE_UNAVAILABLE";
  return BREVO_SMS_REASONS.NOT_CONFIGURED;
}

export async function isBrevoSmsConfigured(runtime?: BrevoSmsRuntimeConfig): Promise<boolean> {
  return (runtime ?? await getActiveBrevoSmsRuntimeConfig()).configured;
}

export async function sendBrevoSms(input: BrevoSmsInput, runtime?: BrevoSmsRuntimeConfig): Promise<BrevoSendResult> {
  const cfg = runtime ?? await getActiveBrevoSmsRuntimeConfig();
  if (!cfg.configured) return { ok: false, reason: failureReason(cfg) };
  const sender = (input.sender ?? cfg.values.sender).trim();
  if (!sender) return { ok: false, reason: BREVO_SMS_REASONS.NOT_CONFIGURED };
  const payload: Record<string, unknown> = {
    sender,
    recipient: input.to,
    content: input.content,
    type: input.type ?? brevoSmsDefaultType(),
    unicodeEnabled: true,
  };
  if (input.tag) payload.tag = input.tag;
  if (input.webUrl) payload.webUrl = input.webUrl;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(BREVO_SMS_ENDPOINT, {
      method: "POST",
      headers: { "api-key": cfg.values.apiKey, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const { reason, detail } = mapBrevoError(res.status, body);
      return { ok: false, reason, detail };
    }
    const idRaw = body && typeof body === "object" ? (body as { messageId?: unknown; reference?: unknown }).messageId ?? (body as { reference?: unknown }).reference : null;
    const messageId = typeof idRaw === "string" ? idRaw : typeof idRaw === "number" ? String(idRaw) : null;
    return { ok: true, providerMessageId: messageId, internalAccepted: messageId == null };
  } catch (error) {
    console.error("sendBrevoSms failed", scrubBrevo(String(error)));
    return { ok: false, reason: BREVO_SMS_REASONS.REQUEST_FAILED };
  }
}
