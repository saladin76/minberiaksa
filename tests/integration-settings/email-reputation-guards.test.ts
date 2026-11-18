import test from "node:test";
import assert from "node:assert/strict";
import { normalizeElasticEmailEvents, suppressionForError } from "../../lib/communication/providers/elastic-email/webhook-events";
import { reminderPreviousAttemptWindows } from "../../lib/events/donation-lapsed-policy";

test("permanent refusals in Elastic's error text suppress the address (texts from the 2026-11-18 audit)", () => {
  assert.equal(suppressionForError("Delivery not attempted because Contact's status was 'Invalid' at the time of sending."), "hard-bounce");
  assert.equal(suppressionForError("Delivery not attempted because Contact's status was 'Unsubscribed' at the time of sending."), "unsubscribe");
  assert.equal(suppressionForError("Mailbox unavailable. The server response was: 5.1.1 The email account that you tried to reach does not exist."), "hard-bounce");
  assert.equal(suppressionForError("Contact's status was 'Abuse'"), "complaint");
});

test("reputation or temporary problems never suppress an address", () => {
  for (const m of [
    "Delivery failed due to account problem or spam block. Will attempt again later.",
    "Insufficient system storage. The server response was: 4.2.2 The recipient's inbox is out of storage space.",
    "Error in processing. The server response was: 4.7.652 The mail server [x] has exceeded the maximum number of connections.",
    "Mailbox unavailable. The server response was: 5.7.1 Unfortunately, messages from [x] weren't sent.",
    "ELASTIC_EMAIL_REQUEST_FAILED", "", null,
  ]) assert.equal(suppressionForError(m), "none", String(m));
});

test("a 'suppress' event now carries the suppression its text implies; other events are unchanged", () => {
  const [refused] = normalizeElasticEmailEvents({ MessageID: "m1", EventType: "Suppress", To: "a@b.org", Error: "Contact's status was 'Invalid'" });
  assert.equal(refused.status, "FAILED"); assert.equal(refused.suppression, "hard-bounce");
  const [spam] = normalizeElasticEmailEvents({ MessageID: "m2", EventType: "Error", To: "a@b.org", Error: "Delivery failed due to account problem or spam block." });
  assert.equal(spam.suppression, "none");
  const [unsub] = normalizeElasticEmailEvents({ MessageID: "m3", EventType: "Unsubscribe", To: "a@b.org" });
  assert.equal(unsub.suppression, "unsubscribe");
  const [opened] = normalizeElasticEmailEvents({ MessageID: "m4", EventType: "Open", To: "a@b.org" });
  assert.equal(opened.suppression, "none");
});

test("a reminder the provider accepted counts as sent: full cooldown, no weekly retry", () => {
  const cooldown = new Date("2026-09-19T00:00:00Z"), failed = new Date("2026-11-11T00:00:00Z");
  const windows = reminderPreviousAttemptWindows(cooldown, failed) as Array<Record<string, unknown>>;
  const accepted = windows.find((w) => JSON.stringify(w).includes("providerMessageId"));
  assert.ok(accepted, "a window for failures after provider acceptance");
  assert.deepEqual(JSON.parse(JSON.stringify(accepted)), { status: { in: ["FAILED", "SKIPPED"] }, providerMessageId: { not: null }, createdAt: { gte: cooldown.toISOString() } });
  assert.ok(windows.some((w) => JSON.stringify(w) === JSON.stringify({ status: { in: ["FAILED", "SKIPPED"] }, createdAt: { gte: failed } })), "never-sent failures still retry after the short backoff");
});
