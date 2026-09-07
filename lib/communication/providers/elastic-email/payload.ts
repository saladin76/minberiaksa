import { formatSenderIdentity, type ElasticEmailInput } from "./types";

/**
 * Pure request/response shaping for the Elastic Email v4 transactional endpoint. Kept free of any
 * runtime-config or Prisma import so it can be unit-tested without a database or server-only module.
 */

export const ELASTIC_EMAIL_ENDPOINT = "https://api.elasticemail.com/v4/emails/transactional";
export const ELASTIC_EMAIL_EVENTS_ENDPOINT = "https://api.elasticemail.com/v4/events";
/** Elastic Email caps a page well below this; the limit only stops one poll growing unbounded. */
export const MAX_EVENTS_PER_POLL = 500;

/**
 * Query for the account event feed, used to reconcile delivery rows that the send path could only
 * record as "accepted". Kept here rather than beside the fetch so it stays testable without pulling
 * in runtime-config.
 */
export function buildElasticEmailEventsUrl(since: Date, limit = MAX_EVENTS_PER_POLL): string {
  // The API expects a naive `YYYY-MM-DDTHH:mm:ss` timestamp in UTC — a trailing `Z` is rejected.
  const from = since.toISOString().slice(0, 19);
  return `${ELASTIC_EMAIL_EVENTS_ENDPOINT}?from=${encodeURIComponent(from)}&limit=${Math.min(limit, MAX_EVENTS_PER_POLL)}`;
}

export function buildElasticEmailPayload(input: ElasticEmailInput, sender: { email: string; name: string }): Record<string, unknown> {
  const body: Array<Record<string, string>> = [{ ContentType: "HTML", Content: input.html, Charset: "utf-8" }];
  if (input.text) body.push({ ContentType: "PlainText", Content: input.text, Charset: "utf-8" });

  const content: Record<string, unknown> = {
    From: formatSenderIdentity(sender.email, sender.name),
    Subject: input.subject,
    Body: body,
  };
  if (input.replyTo) content.ReplyTo = input.replyTo;
  if (input.toName) content.To = [formatSenderIdentity(input.to, input.toName)];

  return {
    Recipients: { To: [input.to] },
    Content: content,
    Options: {
      TrackOpens: input.trackOpens ?? true,
      TrackClicks: input.trackClicks ?? true,
      ...(input.channelName ? { ChannelName: input.channelName } : {}),
    },
  };
}

/** Read the provider message id from a v4 response, tolerating casing differences. */
export function readElasticEmailMessageId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const row = body as Record<string, unknown>;
  for (const key of ["MessageID", "MessageId", "messageId", "messageid", "TransactionID", "TransactionId", "transactionId"]) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
