import { fetchElasticEmailEvents } from "./providers/elastic-email/events-api";
import { normalizeElasticEmailEvents } from "./providers/elastic-email/webhook-events";
import { processElasticEmailEvents, type EmailWebhookSummary } from "./email-webhook-service";

/**
 * Pull-based reconciliation of email delivery outcomes.
 *
 * `markDeliveryStatus(deliveryId, "SENT", …)` at the end of a campaign send records one fact:
 * Elastic Email returned 2xx, i.e. it ACCEPTED the message. Whether it then delivered, deferred,
 * bounced or suppressed it is decided minutes later and reported only through the webhook. If that
 * webhook is not registered on the provider side — as it currently is not — no row is ever
 * corrected, so the campaign screen reports أُرسل for mail nobody received. That is not a display
 * bug; it is the only information the app has.
 *
 * This closes the loop without depending on provider-side configuration: poll the account's event
 * feed and push it through the SAME pipeline the webhook uses. `processElasticEmailEvents` is
 * already idempotent on `idempotencyKey`, and `shouldApplyDeliveryStatus` already refuses to walk a
 * delivery backwards, so running this alongside a working webhook double-counts nothing.
 */

/** How far back a poll looks. Comfortably wider than the cron interval so a skipped run self-heals. */
export const DEFAULT_LOOKBACK_MINUTES = 180;
/**
 * Ceiling for an explicit backfill (30 days). Anything the routine 3-hour window missed — because
 * the cron was not deployed yet, or was down longer than the window — stays wrong forever
 * otherwise: nothing re-examines a delivery once its send call returned. One poll still returns at
 * most `MAX_EVENTS_PER_POLL` events, so a wide backfill can be truncated; the returned `received`
 * count is what tells you whether it was.
 */
export const MAX_LOOKBACK_MINUTES = 30 * 24 * 60;

export type EmailEventSyncResult =
  | ({ ok: true; since: string } & EmailWebhookSummary)
  | { ok: false; reason: string; detail?: string };

export async function syncElasticEmailEvents(opts: { lookbackMinutes?: number } = {}): Promise<EmailEventSyncResult> {
  const lookback = Math.min(MAX_LOOKBACK_MINUTES, Math.max(5, opts.lookbackMinutes ?? DEFAULT_LOOKBACK_MINUTES));
  const since = new Date(Date.now() - lookback * 60_000);

  const fetched = await fetchElasticEmailEvents(since);
  if (!fetched.ok) return { ok: false, reason: fetched.reason, detail: fetched.detail };

  const events = normalizeElasticEmailEvents(fetched.payload);
  const summary = await processElasticEmailEvents(events);
  return { ok: true, since: since.toISOString(), ...summary };
}
