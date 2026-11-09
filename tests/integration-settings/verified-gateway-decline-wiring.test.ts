import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = (path: string) => readFileSync(path, "utf8");
test("signed Stripe failure handler invokes verified card-decline adapter", () => {
  const webhook = src("app/api/stripe/webhook/route.ts");
  const adapter = src("lib/site-security/stripe-verified-decline.ts");
  assert.match(webhook, /stripe\.webhooks\.constructEvent\(/);
  assert.match(webhook, /recordSignedStripeCardDecline\(intent, event\.id, donation\)/);
  assert.match(webhook, /case "payment_intent\.payment_failed":/);
  assert.match(webhook, /invoice\) break/);
  assert.match(adapter, /error\?\.type !== "card_error"/);
  assert.match(adapter, /DONATION_ABUSE_GUARD_ENABLED !== "true"/);
  assert.match(adapter, /recordVerifiedDonationFailure\(/);
  assert.doesNotMatch(adapter, /PENDING|PROVIDER_ERROR/);
});
test("bank-origin redirects without authenticated response must not increment fraud counter", () => {
  const failCallback = src("app/api/payfor/3dpay/fail/route.ts");
  assert.doesNotMatch(failCallback, /recordVerifiedDonationFailure|recordConfirmedAlbarakaSaleDecline/);
});

test("Albaraka adapter counts only explicit issuer card declines after verified Sale", () => {
  const callback = src("app/api/albaraka/3d/callback/route.ts");
  const adapter = src("lib/site-security/albaraka-verified-decline.ts");
  assert.match(callback, /recordConfirmedAlbarakaSaleDecline\(/);
  assert.match(callback, /isAlbarakaApproved\(sale\)/);
  assert.match(adapter, /\["05", "51", "54", "57", "59"\]/);
  assert.match(adapter, /recordVerifiedDonationFailure\(/);
  assert.doesNotMatch(adapter, /"00"|"96"|"91"/);
});
