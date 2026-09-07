import { getActiveElasticEmailRuntimeConfig, RUNTIME_FAILURE, type ActiveRuntimeConfig, type ElasticEmailRuntimeValues } from "../../runtime-config";
import { ELASTIC_EMAIL_REASONS, mapElasticEmailError, scrubElasticEmail } from "./errors";
import { buildElasticEmailPayload, readElasticEmailMessageId, ELASTIC_EMAIL_ENDPOINT } from "./payload";
import type { ElasticEmailInput, ElasticEmailSendResult } from "./types";

/**
 * Elastic Email transactional adapter (REST API v4).
 *
 * Endpoint: POST https://api.elasticemail.com/v4/emails/transactional
 * Auth:     X-ElasticEmail-ApiKey header (never logged, never returned to a caller).
 * Response: { MessageID, TransactionID } — MessageID is stored as the providerMessageId so the
 *           webhook can later advance the delivery to DELIVERED/OPENED/CLICKED/FAILED.
 */

const REQUEST_TIMEOUT_MS = 15_000;

export type ElasticEmailRuntimeConfig = ActiveRuntimeConfig<ElasticEmailRuntimeValues>;

function failureReason(cfg: ElasticEmailRuntimeConfig): string {
  if (cfg.configured) return ELASTIC_EMAIL_REASONS.NOT_CONFIGURED;
  if (cfg.reason === RUNTIME_FAILURE.PROVIDER_DISABLED) return "PROVIDER_DISABLED";
  if (cfg.reason === RUNTIME_FAILURE.INTEGRATION_DECRYPTION_FAILED) return "INTEGRATION_DECRYPTION_FAILED";
  if (cfg.reason === RUNTIME_FAILURE.INTEGRATION_DATABASE_UNAVAILABLE) return "INTEGRATION_DATABASE_UNAVAILABLE";
  return ELASTIC_EMAIL_REASONS.NOT_CONFIGURED;
}

export async function isElasticEmailConfigured(runtime?: ElasticEmailRuntimeConfig): Promise<boolean> {
  return (runtime ?? await getActiveElasticEmailRuntimeConfig()).configured;
}

export async function sendElasticEmail(input: ElasticEmailInput, runtime?: ElasticEmailRuntimeConfig): Promise<ElasticEmailSendResult> {
  const cfg = runtime ?? await getActiveElasticEmailRuntimeConfig();
  if (!cfg.configured) return { ok: false, reason: failureReason(cfg) };

  const senderEmail = (input.senderEmail ?? cfg.values.senderEmail).trim();
  if (!senderEmail) return { ok: false, reason: ELASTIC_EMAIL_REASONS.SENDER_NOT_CONFIGURED };
  const senderName = (input.senderName ?? cfg.values.senderName ?? "").trim();

  const payload = buildElasticEmailPayload(input, { email: senderEmail, name: senderName });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(ELASTIC_EMAIL_ENDPOINT, {
      method: "POST",
      headers: {
        "X-ElasticEmail-ApiKey": cfg.values.apiKey,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    const raw = await res.text().catch(() => "");
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = raw;
    }

    if (!res.ok) {
      const { reason, detail } = mapElasticEmailError(res.status, parsed, cfg.values.apiKey);
      return { ok: false, reason, detail };
    }

    const messageId = readElasticEmailMessageId(parsed);
    // A 2xx with no id still means Elastic Email accepted the message; flag it as internally
    // accepted so the delivery is not silently treated as provider-confirmed.
    return { ok: true, providerMessageId: messageId, internalAccepted: messageId == null };
  } catch (error) {
    console.error("sendElasticEmail failed", scrubElasticEmail(String(error), cfg.values.apiKey));
    return { ok: false, reason: ELASTIC_EMAIL_REASONS.REQUEST_FAILED };
  }
}
