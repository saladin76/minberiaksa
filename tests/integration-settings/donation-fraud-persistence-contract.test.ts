import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const source = (path: string) => readFileSync(path, "utf8");

test("fraud state uses an HMAC identity and revision-based atomic updates", () => {
  const file = source("lib/site-security/donation-abuse-store.ts");
  assert.match(file, /createHmac\("sha256"/);
  assert.match(file, /findAndModify/);
  assert.match(file, /revision: prior\.revision/);
  assert.match(file, /providerEventId/);
  assert.match(file, /advanceProtection\(/);
  assert.match(file, /releaseProtection\(/);
  assert.match(file, /processedEventIds: prior\.state\.processedEventIds/);
  assert.match(file, /\n\s*state: \{ \.\.\.releaseProtection\(now\)/);
  assert.doesNotMatch(file, /\\\\n\s*state:/);
});
test("blocked payment attempts are checked before provider initiation", () => {
  const file = source("lib/site-security/payment-initiation-budget.ts");
  assert.match(file, /inspectDonationAbuseRestriction/);
  assert.match(file, /PAYMENT_REVIEW_BLOCKED/);
  assert.match(file, /PAYMENT_COOLDOWN/);
  assert.match(file, /DONATION_ABUSE_GUARD_ENABLED/);
});
test("fraud cases are admin-only and unblocking requires a reviewed revision", () => {
  const file = source("app/api/admin/site-security/fraud/route.ts");
  assert.match(file, /requireAdminSession\(session\)/);
  assert.match(file, /RELEASE_FRAUD_BLOCK/);
  assert.match(file, /expectedRevision/);
  assert.match(file, /INVALID_REQUEST_ORIGIN/);
});
test("public operator view includes release action but not payment credentials", () => {
  const ui = source("app/(dashboard)/dashboard/security/DonationFraudReview.tsx");
  assert.match(ui, /رفع التقييد/);
  assert.match(ui, /expectedRevision: row\.revision/);
  assert.doesNotMatch(ui, /cardNumber|cvc|clientSecret|accessToken/);
});
