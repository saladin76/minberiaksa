import test from "node:test";
import assert from "node:assert/strict";
import { INTEGRATION_PROVIDERS, INTEGRATION_PROVIDER_DEFINITIONS, getProviderDefinition } from "../../lib/integration-settings/catalog";
import { validateIntegrationSettingValue } from "../../lib/integration-settings/validation";
import { buildElasticEmailWebhookUrl, generateWebhookToken, webhookTokenMatches } from "../../lib/integration-settings/provider-webhook";
import { buildElasticEmailPayload, buildElasticEmailEventsUrl, readElasticEmailMessageId } from "../../lib/communication/providers/elastic-email/payload";
import { formatSenderIdentity } from "../../lib/communication/providers/elastic-email/types";
import { ELASTIC_EMAIL_REASONS, mapElasticEmailError, scrubElasticEmail } from "../../lib/communication/providers/elastic-email/errors";
import {
  extractRawEvents,
  mapElasticEmailEventStatus,
  normalizeElasticEmailEvents,
  suppressionForEvent,
} from "../../lib/communication/providers/elastic-email/webhook-events";
import { shouldApplyDeliveryStatus } from "../../lib/communication/delivery-status-progress";

/* ───────────────────────────── catalog / architecture ───────────────────────────── */

test("Elastic Email is a registered provider and Brevo no longer carries email fields", () => {
  assert.ok((INTEGRATION_PROVIDERS as readonly string[]).includes("ELASTIC_EMAIL"));

  const elastic = getProviderDefinition("ELASTIC_EMAIL");
  const keys = elastic.fields.map((field) => field.key);
  assert.deepEqual(keys, ["API_KEY", "SENDER_NAME", "SENDER_EMAIL", "WEBHOOK_SECRET"]);
  assert.deepEqual(elastic.fields.filter((field) => field.required).map((field) => field.key), ["API_KEY", "SENDER_EMAIL"]);
  assert.equal(elastic.fields.find((field) => field.key === "API_KEY")?.secret, true);
  assert.equal(elastic.fields.find((field) => field.key === "SENDER_EMAIL")?.secret, false);

  const brevoKeys = getProviderDefinition("BREVO").fields.map((field) => field.key);
  assert.deepEqual(brevoKeys, ["API_KEY", "SMS_SENDER", "WEBHOOK_SECRET"]);
  assert.equal(brevoKeys.some((key) => key.includes("EMAIL")), false);
});

test("every provider field maps to a unique environment key", () => {
  const envKeys = Object.values(INTEGRATION_PROVIDER_DEFINITIONS).flatMap((definition) => definition.fields.map((field) => field.envKey));
  assert.equal(new Set(envKeys).size, envKeys.length, `duplicate env keys: ${envKeys.join(", ")}`);
  for (const field of getProviderDefinition("ELASTIC_EMAIL").fields) {
    assert.match(field.envKey, /^ELASTIC_EMAIL_/);
  }
});

test("Elastic Email field validation rejects bad values", () => {
  assert.equal(validateIntegrationSettingValue("ELASTIC_EMAIL", "SENDER_EMAIL", " noreply@example.org "), "noreply@example.org");
  assert.throws(() => validateIntegrationSettingValue("ELASTIC_EMAIL", "SENDER_EMAIL", "not-an-email"));
  assert.throws(() => validateIntegrationSettingValue("ELASTIC_EMAIL", "API_KEY", "short"));
  assert.throws(() => validateIntegrationSettingValue("ELASTIC_EMAIL", "UNKNOWN_KEY", "x"));
});

/* ───────────────────────────── send payload ───────────────────────────── */

test("transactional payload matches the Elastic Email v4 contract", () => {
  const payload = buildElasticEmailPayload(
    { to: "donor@example.org", subject: "شكرًا لتبرعك", html: "<p>شكرًا</p>", text: "شكرًا" },
    { email: "noreply@yedicihan.org.tr", name: "Gözbebekleri" }
  ) as {
    Recipients: { To: string[] };
    Content: { From: string; Subject: string; Body: { ContentType: string; Content: string; Charset: string }[] };
    Options: Record<string, unknown>;
  };

  assert.deepEqual(payload.Recipients.To, ["donor@example.org"]);
  assert.equal(payload.Content.From, "Gözbebekleri <noreply@yedicihan.org.tr>");
  assert.equal(payload.Content.Subject, "شكرًا لتبرعك");
  assert.deepEqual(payload.Content.Body.map((part) => part.ContentType), ["HTML", "PlainText"]);
  assert.equal(payload.Content.Body[0].Charset, "utf-8");
  assert.equal(payload.Options.TrackOpens, true);
});

test("payload omits the plain-text part when none is rendered", () => {
  const payload = buildElasticEmailPayload({ to: "a@b.org", subject: "s", html: "<p>x</p>" }, { email: "from@b.org", name: "" }) as {
    Content: { From: string; Body: unknown[] };
  };
  assert.equal(payload.Content.Body.length, 1);
  assert.equal(payload.Content.From, "from@b.org");
});

test("sender identity quotes display names that would break the From header", () => {
  assert.equal(formatSenderIdentity("a@b.org", null), "a@b.org");
  assert.equal(formatSenderIdentity("a@b.org", "Gözbebekleri"), "Gözbebekleri <a@b.org>");
  assert.equal(formatSenderIdentity("a@b.org", "Charity, Inc <spoof@evil.org>"), '"Charity, Inc <spoof@evil.org>" <a@b.org>');
  assert.equal(formatSenderIdentity("a@b.org", "Line\nBreak"), "Line Break <a@b.org>");
});

test("provider message id is read across response casings", () => {
  assert.equal(readElasticEmailMessageId({ MessageID: "msg-1" }), "msg-1");
  assert.equal(readElasticEmailMessageId({ messageId: "msg-2" }), "msg-2");
  assert.equal(readElasticEmailMessageId({ TransactionID: "tx-3" }), "tx-3");
  assert.equal(readElasticEmailMessageId({}), null);
  assert.equal(readElasticEmailMessageId("plain text"), null);
});

/* ───────────────────────────── errors ───────────────────────────── */

test("HTTP failures map to safe reason codes", () => {
  assert.equal(mapElasticEmailError(401, { Error: "bad key" }).reason, ELASTIC_EMAIL_REASONS.UNAUTHORIZED);
  assert.equal(mapElasticEmailError(403, {}).reason, ELASTIC_EMAIL_REASONS.UNAUTHORIZED);
  assert.equal(mapElasticEmailError(429, {}).reason, ELASTIC_EMAIL_REASONS.RATE_LIMITED);
  assert.equal(mapElasticEmailError(400, { Error: "unverified sender" }).reason, ELASTIC_EMAIL_REASONS.REJECTED);
  assert.equal(mapElasticEmailError(503, {}).reason, ELASTIC_EMAIL_REASONS.REQUEST_FAILED);
  assert.match(mapElasticEmailError(400, { Error: "unverified sender" }).detail, /unverified sender/);
});

test("api keys never survive scrubbing", () => {
  const key = "A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0";
  assert.equal(scrubElasticEmail(`failed with x-elasticemail-apikey: ${key}`).includes(key), false);
  assert.equal(scrubElasticEmail(`Error 401 for ${key}`).includes(key), false);
  assert.ok(scrubElasticEmail("x".repeat(1000)).length <= 300);
});

test("a provider body that echoes the live key is redacted in the stored detail", () => {
  // Elastic Email returns the submitted key inside some 401 bodies. A short/odd-shaped key would
  // not match the generic heuristics, so the live value must be redacted explicitly.
  const liveKey = "elastic-key-abcdef0123456789";
  const { detail } = mapElasticEmailError(401, { Error: `Invalid api key ${liveKey}` }, liveKey);
  assert.equal(detail.includes(liveKey), false, detail);
  assert.match(detail, /401/);

  // Still scrubbed when the caller does not hand over the key, via the shape heuristics.
  const longKey = "B7f2K9xQ1mW4zR8tY6uL3nH5jP0sD2gV";
  assert.equal(scrubElasticEmail(`401: rejected ${longKey}`).includes(longKey), false);
});

/* ───────────────────────────── webhook normalization ───────────────────────────── */

test("event names map to delivery statuses regardless of casing or separators", () => {
  assert.equal(mapElasticEmailEventStatus("Sent"), "SENT");
  assert.equal(mapElasticEmailEventStatus("delivered"), "DELIVERED");
  assert.equal(mapElasticEmailEventStatus("Opened"), "OPENED");
  assert.equal(mapElasticEmailEventStatus("Clicked"), "CLICKED");
  assert.equal(mapElasticEmailEventStatus("hard_bounce"), "BOUNCED");
  assert.equal(mapElasticEmailEventStatus("Unsubscribed"), "UNSUBSCRIBED");
  assert.equal(mapElasticEmailEventStatus("something-else"), null);
  assert.equal(mapElasticEmailEventStatus(null), null);
});

test("a spam complaint is an opt-out, not a delivery failure", () => {
  // It used to map to FAILED, which both inflated the failure count and — because
  // nothing downstream reacts to FAILED — left the complainant in every future
  // audience. The message reached them; they opted out in the harshest way.
  for (const name of ["AbuseReport", "abuse", "Spam", "SpamComplaint", "complaint"]) {
    assert.equal(mapElasticEmailEventStatus(name), "UNSUBSCRIBED", `failed for ${name}`);
  }
});

test("only permanent failures suppress the address", () => {
  assert.equal(suppressionForEvent("Unsubscribed"), "unsubscribe");
  assert.equal(suppressionForEvent("AbuseReport"), "complaint");
  assert.equal(suppressionForEvent("hard_bounce"), "hard-bounce");
  assert.equal(suppressionForEvent("NotDelivered"), "hard-bounce");

  // A soft bounce is a full mailbox or a temporary DNS failure. Suppressing on
  // it would permanently mute a reachable donor, so it must not.
  assert.equal(suppressionForEvent("soft_bounce"), "none");
  assert.equal(suppressionForEvent("Bounced"), "none");
  assert.equal(suppressionForEvent("Error"), "none");

  // Engagement never suppresses.
  for (const name of ["Sent", "Delivered", "Opened", "Clicked"]) {
    assert.equal(suppressionForEvent(name), "none", `failed for ${name}`);
  }
  assert.equal(suppressionForEvent(null), "none");
});

test("normalized events carry their suppression reason", () => {
  const events = normalizeElasticEmailEvents([
    { messageid: "m1", eventtype: "Opened", to: "a@b.org" },
    { messageid: "m2", eventtype: "Unsubscribed", to: "c@d.org" },
    { messageid: "m3", eventtype: "AbuseReport", to: "e@f.org" },
    { messageid: "m4", eventtype: "HardBounce", to: "g@h.org" },
    { messageid: "m5", eventtype: "SoftBounce", to: "i@j.org" },
  ]);
  assert.deepEqual(
    events.map((e) => e.suppression),
    ["none", "unsubscribe", "complaint", "hard-bounce", "none"]
  );
  // The recipient must survive normalization — it is the only handle the
  // suppression step has on the donor.
  assert.deepEqual(events.map((e) => e.recipient), ["a@b.org", "c@d.org", "e@f.org", "g@h.org", "i@j.org"]);
});

test("payload unwrapping handles single objects, arrays, and wrapped collections", () => {
  assert.equal(extractRawEvents({ messageid: "a", eventtype: "Sent" }).length, 1);
  assert.equal(extractRawEvents([{ messageid: "a" }, { messageid: "b" }]).length, 2);
  assert.equal(extractRawEvents({ Events: [{ messageid: "a" }] }).length, 1);
  assert.equal(extractRawEvents(null).length, 0);
  assert.equal(extractRawEvents("nope").length, 0);
});

test("events normalize across Elastic Email field-name generations", () => {
  const events = normalizeElasticEmailEvents([
    { messageid: "m1", eventtype: "Delivered", to: "a@b.org", date: "2026-08-01T10:00:00Z" },
    { MessageID: "m2", EventType: "Opened", email: "c@d.org" },
    { msgid: "m3", status: "Error", to: "e@f.org", error: "mailbox full" },
  ]);

  assert.equal(events.length, 3);
  assert.deepEqual(events.map((event) => event.status), ["DELIVERED", "OPENED", "FAILED"]);
  assert.deepEqual(events.map((event) => event.providerMessageId), ["m1", "m2", "m3"]);
  assert.deepEqual(events.map((event) => event.recipient), ["a@b.org", "c@d.org", "e@f.org"]);
  assert.equal(events[2].errorMessage, "mailbox full");
  // Errors carry the reason; successes must not invent one.
  assert.equal(events[0].errorMessage, null);
});

test("unusable events are dropped rather than guessed", () => {
  assert.deepEqual(normalizeElasticEmailEvents([{ eventtype: "Delivered" }]), []); // no message id
  assert.deepEqual(normalizeElasticEmailEvents([{ messageid: "m1" }]), []); // no event type
  assert.deepEqual(normalizeElasticEmailEvents([{ messageid: "m1", eventtype: "Queued" }]), []); // unmapped event
});

test("idempotency keys separate distinct events and repeat for identical ones", () => {
  const [first] = normalizeElasticEmailEvents([{ messageid: "m1", eventtype: "Opened", date: "2026-08-01T10:00:00Z" }]);
  const [again] = normalizeElasticEmailEvents([{ messageid: "m1", eventtype: "Opened", date: "2026-08-01T10:00:00Z" }]);
  const [clicked] = normalizeElasticEmailEvents([{ messageid: "m1", eventtype: "Clicked", date: "2026-08-01T10:00:00Z" }]);
  assert.equal(first.idempotencyKey, again.idempotencyKey);
  assert.notEqual(first.idempotencyKey, clicked.idempotencyKey);
});

/* ───────────────────────────── status ladder ───────────────────────────── */

test("engagement statuses only move forward but terminal outcomes always apply", () => {
  assert.equal(shouldApplyDeliveryStatus("SENT", "DELIVERED"), true);
  assert.equal(shouldApplyDeliveryStatus("DELIVERED", "OPENED"), true);
  assert.equal(shouldApplyDeliveryStatus("OPENED", "CLICKED"), true);
  // Out-of-order webhooks must not downgrade progress.
  assert.equal(shouldApplyDeliveryStatus("CLICKED", "DELIVERED"), false);
  assert.equal(shouldApplyDeliveryStatus("OPENED", "SENT"), false);
  assert.equal(shouldApplyDeliveryStatus("DELIVERED", "DELIVERED"), false);
  // Failures are the final word whenever they arrive.
  assert.equal(shouldApplyDeliveryStatus("CLICKED", "BOUNCED"), true);
  assert.equal(shouldApplyDeliveryStatus("DELIVERED", "UNSUBSCRIBED"), true);
  assert.equal(shouldApplyDeliveryStatus("FAILED", "FAILED"), false);
  assert.equal(shouldApplyDeliveryStatus(null, "DELIVERED"), true);
  // Shared with the Brevo SMS webhook: a replayed `sent` after delivery is ignored there too.
  assert.equal(shouldApplyDeliveryStatus("DELIVERED", "SENT"), false);
});

/* ───────────────────────────── pull-based event feed ───────────────────────────── */

/**
 * Verbatim rows from `GET /v4/events` on the live account. The send path can only ever record
 * "the provider returned 2xx"; these are the events that say what happened afterwards, and they
 * are the only thing that can turn an over-optimistic SENT row into the truth.
 */
const LIVE_EVENT_FEED = [
  {
    TransactionID: "f01ce91d-22a4-823d-001d-aef4225c5024",
    MsgID: "ho3apRyH2qK9s5TBPlMkew2",
    FromEmail: "info@yedicihan.org",
    To: "salahelnabtity@gamil.com",
    EventType: "Suppress",
    EventDate: "2026-08-06T12:47:46Z",
    MessageCategory: "NotDelivered",
    Message: "Delivery to this domain is not permitted on your account until the trust level of your mail increases.",
  },
  {
    TransactionID: "f01ce904-1ea4-0149-c004-dced3b45495b",
    MsgID: "oxqUU2gsBIPZ_UwdTz2w8g2",
    FromEmail: "info@yedicihan.org",
    To: "theaxhunter303@gmail.com",
    EventType: "Error",
    EventDate: "2026-08-06T12:47:41Z",
    MessageCategory: "AccountProblem",
    Message: "Delivery failed due to account problem or spam block. Will attempt again at a later date.",
  },
  { MsgID: "aaa", To: "x@y.com", EventType: "Sent", EventDate: "2026-08-06T05:59:46Z", MessageCategory: "Unknown", Message: "" },
  { MsgID: "bbb", To: "x@y.com", EventType: "Open", EventDate: "2026-08-05T23:01:03Z", MessageCategory: "Unknown", Message: "" },
  { MsgID: "ccc", To: "x@y.com", EventType: "Click", EventDate: "2026-08-05T22:37:16Z", MessageCategory: "Unknown", Message: "" },
  { MsgID: "ddd", To: "x@y.com", EventType: "Submission", EventDate: "2026-08-06T12:47:41Z", MessageCategory: "Unknown", Message: "" },
];

test("an accepted-then-refused message normalizes to a failure, not a success", () => {
  const events = normalizeElasticEmailEvents(LIVE_EVENT_FEED);
  const suppressed = events.find((e) => e.providerMessageId === "ho3apRyH2qK9s5TBPlMkew2");
  assert.ok(suppressed, "a Suppress event must not be dropped — it is the whole point of the sync");
  assert.equal(suppressed.status, "FAILED");
  // Without the reason the operator sees a bare FAILED and still cannot act on it.
  assert.match(suppressed.errorMessage ?? "", /trust level/);

  const errored = events.find((e) => e.providerMessageId === "oxqUU2gsBIPZ_UwdTz2w8g2");
  assert.equal(errored?.status, "FAILED");
  assert.match(errored?.errorMessage ?? "", /account problem or spam block/);
});

test("the pull feed keys on MsgID and maps the tracked lifecycle events", () => {
  const byId = new Map(normalizeElasticEmailEvents(LIVE_EVENT_FEED).map((e) => [e.providerMessageId, e.status]));
  assert.equal(byId.get("aaa"), "SENT");
  assert.equal(byId.get("bbb"), "OPENED");
  assert.equal(byId.get("ccc"), "CLICKED");
  // "Submission" is Elastic Email accepting the payload — exactly the fact the send already
  // recorded. Treating it as a delivery state would re-assert the claim under investigation.
  assert.equal(byId.has("ddd"), false);
  assert.equal(byId.size, 5);
});

test("a success event carries no error text", () => {
  const sent = normalizeElasticEmailEvents(LIVE_EVENT_FEED).find((e) => e.providerMessageId === "aaa");
  assert.equal(sent?.errorMessage, null);
});

test("repeated polls of the same feed produce identical idempotency keys", () => {
  const first = normalizeElasticEmailEvents(LIVE_EVENT_FEED).map((e) => e.idempotencyKey);
  const second = normalizeElasticEmailEvents(LIVE_EVENT_FEED).map((e) => e.idempotencyKey);
  assert.deepEqual(first, second);
  assert.equal(new Set(first).size, first.length);
});

test("the events URL sends a naive UTC timestamp, which the API requires", () => {
  const url = buildElasticEmailEventsUrl(new Date("2026-08-06T12:00:00.000Z"), 500);
  assert.match(url, /^https:\/\/api\.elasticemail\.com\/v4\/events\?/);
  assert.match(url, /from=2026-08-06T12%3A00%3A00(?!Z)/);
  assert.equal(url.includes("Z&"), false);
  // The page size is bounded so one poll cannot grow without limit.
  assert.match(buildElasticEmailEventsUrl(new Date("2026-08-06T12:00:00.000Z"), 10_000), /limit=500/);
});

/* ───────────────────────────── webhook token ───────────────────────────── */

test("Elastic Email webhook token is server-generated and embedded once", () => {
  const token = generateWebhookToken();
  assert.ok(token.length >= 43);
  assert.notEqual(token, generateWebhookToken());
  const url = buildElasticEmailWebhookUrl(token, { NODE_ENV: "test", NEXTAUTH_URL: "https://example.org" } as NodeJS.ProcessEnv);
  assert.equal(url, `https://example.org/api/webhooks/elastic-email?token=${encodeURIComponent(token)}`);
  assert.equal((url.match(/token=/g) ?? []).length, 1);
});

test("webhook token comparison rejects wrong and truncated tokens", () => {
  const token = generateWebhookToken();
  assert.equal(webhookTokenMatches(token, token), true);
  assert.equal(webhookTokenMatches(token.slice(0, -1), token), false);
  assert.equal(webhookTokenMatches("", token), false);
  assert.equal(webhookTokenMatches(null, token), false);
});
