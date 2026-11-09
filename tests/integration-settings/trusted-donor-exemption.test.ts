import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
test("trusted donor requires a signed-in account and confirmed previous settlement", () => {
  const code = read("lib/site-security/trusted-donor.ts");
  assert.match(code, /getServerSession\(authOptions\)/);
  assert.match(code, /session\?\.user\?\.id/);
  assert.match(code, /status: "PAID", paidAt: \{ not: null \}/);
  assert.match(code, /donorId/);
  assert.doesNotMatch(code, /session\?\.user\?\.email|findUnique\(\{ where: \{ email/);
});
test("a returning donor cannot claim exemption for another donor's existing order", () => {
  const code = read("lib/site-security/trusted-donor.ts");
  assert.match(code, /where: \{ id: donationId, donorId \}/);
  assert.match(code, /if \(!owned\) return false/);
});
test("verified donor skips progressive fraud block but still passes both velocity checks", () => {
  const code = read("lib/site-security/payment-initiation-budget.ts");
  assert.match(code, /isVerifiedReturningDonor\(donationId\)/);
  assert.match(code, /isVerifiedReturningDonor\(\)/);
  assert.match(code, /if \(!bypassProgressiveFraudBlock\(trusted\)\)/);
  assert.match(code, /count\("ip", ip, ipLimit, now\)/);
  assert.match(code, /count\("donation", donationId, donationLimit, now\)/);
  assert.match(code, /count\("intake", ip, 12, now\)/);
  assert.match(code, /DONATION_ABUSE_GUARD_ENABLED !== "true"/);
});
