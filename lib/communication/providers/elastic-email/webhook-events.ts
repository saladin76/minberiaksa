import type { DeliveryStatusId } from "../../communication-runtime-types";

/**
 * Pure normalizer for Elastic Email HTTP event notifications.
 *
 * Elastic Email posts either a single event object or an array of them, and its field casing has
 * varied across notification generations (`eventtype` / `EventType` / `event`, `messageid` /
 * `msgid` / `MessageID`, …). This module keeps that tolerance in one tested place so the route
 * handler stays trivial and can always answer 200.
 */

/**
 * Why this event means we must stop emailing the recipient.
 *
 * `none` covers every transport/engagement event. The other three are consent
 * and deliverability facts about the ADDRESS, not about one message, so they
 * have to outlive the delivery row that carried them.
 */
export type EmailSuppressionReason = "none" | "unsubscribe" | "complaint" | "hard-bounce";

export type NormalizedEmailEvent = {
  providerMessageId: string;
  eventType: string;
  status: DeliveryStatusId;
  recipient: string | null;
  errorMessage: string | null;
  occurredAt: string | null;
  /** Stable key for idempotent storage: message id + event + timestamp. */
  idempotencyKey: string;
  suppression: EmailSuppressionReason;
};

const STATUS_BY_EVENT: Record<string, DeliveryStatusId> = {
  sent: "SENT",
  delivered: "DELIVERED",
  opened: "OPENED",
  open: "OPENED",
  clicked: "CLICKED",
  click: "CLICKED",
  linkclicked: "CLICKED",
  unsubscribed: "UNSUBSCRIBED",
  unsubscribe: "UNSUBSCRIBED",
  bounced: "BOUNCED",
  bounce: "BOUNCED",
  hardbounce: "BOUNCED",
  softbounce: "BOUNCED",
  error: "FAILED",
  failed: "FAILED",
  // A spam complaint is NOT a failure: the message was delivered and then the
  // recipient pressed "report spam". Filing it under FAILED both overstated the
  // failure count and, worse, produced no consent consequence — so the same
  // donor stayed in every future audience and kept being mailed, which is what
  // damages sender reputation. It is an opt-out, and the strongest kind.
  abusereport: "UNSUBSCRIBED",
  abuse: "UNSUBSCRIBED",
  spam: "UNSUBSCRIBED",
  spamcomplaint: "UNSUBSCRIBED",
  complaint: "UNSUBSCRIBED",
  complained: "UNSUBSCRIBED",
  suppressed: "FAILED",
  // The pull feed (`GET /v4/events`) spells this one "Suppress", not "Suppressed" — and it is the
  // event that says "we accepted your message and then refused to deliver it", i.e. exactly the
  // outcome a SENT delivery row is wrong about. Dropping it left those rows reading as successful.
  suppress: "FAILED",
  notdelivered: "FAILED",
  invalid: "FAILED",
};

/**
 * Only events that prove the address is permanently unusable suppress it.
 *
 * A soft bounce (mailbox full, greylisted, temporary DNS) must not — muting a
 * donor over a full inbox loses a real recipient permanently. Elastic Email's
 * single "Bounce/Error" checkbox delivers both kinds, so the distinction is made
 * here, on the event name, and an ambiguous plain "bounce" is treated as soft.
 */
const SUPPRESSION_BY_EVENT: Record<string, EmailSuppressionReason> = {
  unsubscribed: "unsubscribe",
  unsubscribe: "unsubscribe",
  abusereport: "complaint",
  abuse: "complaint",
  spam: "complaint",
  spamcomplaint: "complaint",
  complaint: "complaint",
  complained: "complaint",
  hardbounce: "hard-bounce",
  invalid: "hard-bounce",
  notdelivered: "hard-bounce",
};

function normalizeEventKey(event: string): string {
  return event.toLowerCase().replace(/[\s_-]/g, "");
}

export function suppressionForEvent(event: string | null): EmailSuppressionReason {
  if (!event) return "none";
  return SUPPRESSION_BY_EVENT[normalizeEventKey(event)] ?? "none";
}

const MESSAGE_ID_KEYS = ["messageid", "msgid", "message_id", "transactionid", "transaction_id"];
const EVENT_KEYS = ["eventtype", "event_type", "event", "status", "category"];
const RECIPIENT_KEYS = ["to", "email", "recipient", "toemail"];
// `message` last: the pull feed carries the provider's explanation there ("Delivery to this domain
// is not permitted on your account until the trust level of your mail increases."), and it is only
// ever read for FAILED/BOUNCED events, so it cannot swallow a non-error field.
const ERROR_KEYS = ["error", "errormessage", "reason", "statusdetails", "detail", "message"];
const DATE_KEYS = ["date", "eventdate", "timestamp", "datesent", "occurredat"];

/** Case-insensitive, underscore-insensitive field lookup over one raw event object. */
function pick(row: Record<string, unknown>, keys: readonly string[]): string | null {
  const lookup = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) lookup.set(key.toLowerCase().replace(/[_-]/g, ""), value);
  for (const key of keys) {
    const value = lookup.get(key.replace(/[_-]/g, ""));
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

export function mapElasticEmailEventStatus(event: string | null): DeliveryStatusId | null {
  if (!event) return null;
  return STATUS_BY_EVENT[normalizeEventKey(event)] ?? null;
}

/** Unwrap the payload into a flat list of raw event objects (single object, array, or `{Events:[…]}`). */
export function extractRawEvents(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
  if (!payload || typeof payload !== "object") return [];
  const row = payload as Record<string, unknown>;
  for (const key of ["Events", "events", "Data", "data"]) {
    const nested = row[key];
    if (Array.isArray(nested)) return nested.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
  }
  return [row];
}

export function normalizeElasticEmailEvents(payload: unknown): NormalizedEmailEvent[] {
  const out: NormalizedEmailEvent[] = [];
  for (const raw of extractRawEvents(payload)) {
    const providerMessageId = pick(raw, MESSAGE_ID_KEYS);
    if (!providerMessageId) continue;

    // `status` doubles as the event name in some payloads; try every candidate before giving up.
    let eventType: string | null = null;
    let status: DeliveryStatusId | null = null;
    for (const key of EVENT_KEYS) {
      const candidate = pick(raw, [key]);
      const mapped = mapElasticEmailEventStatus(candidate);
      if (mapped) {
        eventType = candidate;
        status = mapped;
        break;
      }
      if (candidate && !eventType) eventType = candidate;
    }
    if (!status) continue;

    const occurredAt = pick(raw, DATE_KEYS);
    const resolvedEvent = (eventType ?? status).toLowerCase();
    out.push({
      providerMessageId,
      eventType: resolvedEvent,
      status,
      recipient: pick(raw, RECIPIENT_KEYS),
      errorMessage: status === "FAILED" || status === "BOUNCED" ? pick(raw, ERROR_KEYS) : null,
      occurredAt,
      idempotencyKey: `elastic:${providerMessageId}:${resolvedEvent}:${occurredAt ?? ""}`,
      suppression: suppressionForEvent(resolvedEvent),
    });
  }
  return out;
}
