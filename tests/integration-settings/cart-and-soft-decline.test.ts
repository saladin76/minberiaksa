import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the basket is emptied only by a settled payment (paidAt), never by a new order's status", () => {
  const check = fs.readFileSync("components/minbar/checkout/CartPendingCheck.tsx", "utf8");
  assert.match(check, /if \(details\.paidAt\) \{ clearCart\(\); clearPendingPayment\(\); return; \}/);
  assert.doesNotMatch(check, /details\.status === "PAID"/);
});

test("a 2D suspicion/policy decline moves a one-time donation to 3D once, after the bank confirms no sale", () => {
  const route = fs.readFileSync("app/api/albaraka/3d/initiate/route.ts", "utf8");
  assert.match(route, /const issuerSoftDecline = !plan && !askedAuthentication && \["59", "83", "82", "05"\]\.includes\(responseCode\);/);
  assert.match(route, /if \(!plan && inquiry\.state !== "unknown" && isAlbarakaConfigured\(secureConfig\)\)/);
  assert.match(route, /if \(inquiry\.state === "unknown" && askedAuthentication\)/);
  assert.match(route, /trigger: issuerSoftDecline \? "issuer-soft-decline" : "bank-requested"/);
});
