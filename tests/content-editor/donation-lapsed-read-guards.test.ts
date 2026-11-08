import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "lib/events/donation-lapsed.ts"), "utf8");

test("lapsed reminders never treat an unavailable subscription guard as an empty audience", () => {
  assert.match(source, /await prisma\.subscription\.findMany\(\{ where: \{ status: "ACTIVE" \}/);
  assert.doesNotMatch(source, /prisma\.subscription\.findMany\([\s\S]{0,170}\.catch\(\(\) => \[\]\)/);
});

test("lapsed reminders never treat missing communication preferences as an empty profile set", () => {
  assert.match(source, /const profiles = await prisma\.donorCommunicationProfile\s*\.findMany\(/);
  assert.doesNotMatch(source, /prisma\.donorCommunicationProfile\s*\.findMany\([\s\S]{0,220}\.catch\(\(\) => \[\]\)/);
});

test("provider and persisted delivery idempotency guards remain in place", () => {
  assert.match(source, /reminderPreviousAttemptWindows\(cooldownCutoff, failureRetryCutoff\)/);
  assert.match(source, /SETTLED_DONATION_WHERE/);
  assert.match(source, /await sendTriggerMessage\(trigger, ctx/);
});
