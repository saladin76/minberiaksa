import { getActiveElasticEmailRuntimeConfig, RUNTIME_FAILURE, type ActiveRuntimeConfig, type ElasticEmailRuntimeValues } from "../../runtime-config";
import { ELASTIC_EMAIL_REASONS, scrubElasticEmail } from "./errors";
import { buildElasticEmailEventsUrl, MAX_EVENTS_PER_POLL } from "./payload";

/**
 * Read side of the Elastic Email v4 API: the account's own event feed.
 *
 * Elastic Email answers `POST /v4/emails/transactional` with 2xx the moment it ACCEPTS a message,
 * which is all a send can ever know — acceptance, not delivery. Delivery is reported separately,
 * and the app's only listener for it is the webhook at /api/webhooks/elastic-email. When that
 * webhook is not registered on the provider side, nothing ever contradicts the optimistic SENT row
 * and the dashboard reports success for mail that was suppressed or refused.
 *
 * `GET /v4/events` is the same information, pulled instead of pushed. It keys on `MsgID`, which is
 * what `providerMessageId` stores, so the existing normalizer and the idempotent event pipeline
 * consume it unchanged.
 *
 * Note this is NOT `/v4/emails/{id}/status` — that endpoint keys on `TransactionID` while the send
 * response gives us a `MessageID`, so per-message lookups answer 400 for every row we hold.
 */

const REQUEST_TIMEOUT_MS = 20_000;

export type ElasticEmailEventsResult =
  | { ok: true; payload: unknown }
  | { ok: false; reason: string; detail?: string };

function failureReason(cfg: ActiveRuntimeConfig<ElasticEmailRuntimeValues>): string {
  if (cfg.configured) return ELASTIC_EMAIL_REASONS.NOT_CONFIGURED;
  if (cfg.reason === RUNTIME_FAILURE.PROVIDER_DISABLED) return "PROVIDER_DISABLED";
  if (cfg.reason === RUNTIME_FAILURE.INTEGRATION_DECRYPTION_FAILED) return "INTEGRATION_DECRYPTION_FAILED";
  if (cfg.reason === RUNTIME_FAILURE.INTEGRATION_DATABASE_UNAVAILABLE) return "INTEGRATION_DATABASE_UNAVAILABLE";
  return ELASTIC_EMAIL_REASONS.NOT_CONFIGURED;
}

export async function fetchElasticEmailEvents(
  since: Date,
  runtime?: ActiveRuntimeConfig<ElasticEmailRuntimeValues>,
  limit = MAX_EVENTS_PER_POLL,
): Promise<ElasticEmailEventsResult> {
  const cfg = runtime ?? await getActiveElasticEmailRuntimeConfig();
  if (!cfg.configured) return { ok: false, reason: failureReason(cfg) };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(buildElasticEmailEventsUrl(since, limit), {
      method: "GET",
      headers: { "X-ElasticEmail-ApiKey": cfg.values.apiKey, accept: "application/json" },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    const raw = await res.text().catch(() => "");
    if (!res.ok) {
      return { ok: false, reason: ELASTIC_EMAIL_REASONS.REQUEST_FAILED, detail: scrubElasticEmail(`${res.status}: ${raw}`, cfg.values.apiKey) };
    }
    return { ok: true, payload: raw ? JSON.parse(raw) : [] };
  } catch (error) {
    console.error("fetchElasticEmailEvents failed", scrubElasticEmail(String(error), cfg.values.apiKey));
    return { ok: false, reason: ELASTIC_EMAIL_REASONS.REQUEST_FAILED };
  }
}
