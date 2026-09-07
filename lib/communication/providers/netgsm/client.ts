import { getActiveNetgsmRuntimeConfig, RUNTIME_FAILURE, type ActiveRuntimeConfig, type NetgsmRuntimeValues } from "../../runtime-config";
import { NETGSM_REASONS, mapNetgsmCode, readNetgsmCode, scrubNetgsm } from "./errors";
import { isTurkishNumber, type NetgsmSmsInput, type NetgsmSendResult } from "./types";

const DEFAULT_ENDPOINT = "https://api.netgsm.com.tr/sms/rest/v2/send";
export type NetgsmRuntimeConfig = ActiveRuntimeConfig<NetgsmRuntimeValues>;

function failureReason(cfg: NetgsmRuntimeConfig): string {
  if (cfg.configured) return NETGSM_REASONS.NOT_CONFIGURED;
  if (cfg.reason === RUNTIME_FAILURE.PROVIDER_DISABLED) return "PROVIDER_DISABLED";
  if (cfg.reason === RUNTIME_FAILURE.INTEGRATION_DECRYPTION_FAILED) return "INTEGRATION_DECRYPTION_FAILED";
  if (cfg.reason === RUNTIME_FAILURE.INTEGRATION_DATABASE_UNAVAILABLE) return "INTEGRATION_DATABASE_UNAVAILABLE";
  return NETGSM_REASONS.NOT_CONFIGURED;
}

export async function isNetgsmConfigured(runtime?: NetgsmRuntimeConfig): Promise<boolean> {
  return (runtime ?? await getActiveNetgsmRuntimeConfig()).configured;
}

export { isTurkishNumber };

export async function sendNetgsmSms(input: NetgsmSmsInput, countryCode?: string | null, runtime?: NetgsmRuntimeConfig): Promise<NetgsmSendResult> {
  const cfg = runtime ?? await getActiveNetgsmRuntimeConfig();
  if (!cfg.configured) return { ok: false, reason: failureReason(cfg) };
  if (!isTurkishNumber(input.to, countryCode)) return { ok: false, reason: NETGSM_REASONS.NOT_TURKISH };
  const endpoint = process.env.NETGSM_SMS_ENDPOINT?.trim() || DEFAULT_ENDPOINT;
  const auth = Buffer.from(`${cfg.values.usercode}:${cfg.values.password}`).toString("base64");
  const payload = {
    msgheader: cfg.values.header,
    encoding: "TR",
    messages: [{ msg: input.content, no: input.to.replace(/\D/g, "") }],
  };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      // A non-2xx from Netgsm is usually a rejected send, not an unreachable service: the body
      // still carries the numeric code. Prefer that over the generic transport reason.
      const errorCode = readNetgsmCode(text);
      const reason = errorCode ? mapNetgsmCode(errorCode).reason : NETGSM_REASONS.REQUEST_FAILED;
      return { ok: false, reason, detail: scrubNetgsm(`${res.status}: ${text}`) };
    }
    let code: string | null = null;
    let jobid: string | null = null;
    try {
      const j = JSON.parse(text) as { code?: unknown; jobid?: unknown };
      if (typeof j.code === "string") code = j.code;
      else if (typeof j.code === "number") code = String(j.code);
      if (typeof j.jobid === "string") jobid = j.jobid;
      else if (typeof j.jobid === "number") jobid = String(j.jobid);
    } catch {
      const match = text.trim().match(/^(\d{2})(?:[\s,]+(\d+))?/);
      if (match) { code = match[1]; jobid = match[2] ?? null; }
    }
    if (!code) return { ok: false, reason: NETGSM_REASONS.INVALID_RESPONSE, detail: scrubNetgsm(text) };
    const mapped = mapNetgsmCode(code);
    if (!mapped.ok) return { ok: false, reason: mapped.reason, detail: scrubNetgsm(`code=${code}`) };
    return { ok: true, providerMessageId: jobid, internalAccepted: jobid == null };
  } catch (error) {
    console.error("sendNetgsmSms failed", scrubNetgsm(String(error)));
    return { ok: false, reason: NETGSM_REASONS.REQUEST_FAILED };
  }
}
