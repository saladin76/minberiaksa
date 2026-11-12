import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  PRIVATE_DONATION_LIST_KEYS,
  donationListSafeFields,
} from "../../lib/dashboard/donation-list-privacy";

test("donation listing strips internal receipt tokens, card material, payment and reconciliation evidence", () => {
  const fixture = {
    id: "own-donation",
    status: "PAID",
    amountUSD: 12.5,
    currency: "USD",
    paidAt: "2026-11-11T08:00:00.000Z",
    provider: "ALBARAKA",
    accessToken: "never-return-receipt-bearer",
    providerRaw: { cvc: "never-return-cvc", gatewayKey: "never-return-gateway-key" },
    cardDetails: { cardNumber: "never-return-full-pan" },
    attribution: { email: "never-return-attribution" },
    originalDonorId: "never-return-identity-link",
    providerAuthCode: "never-return-auth-code",
    providerHostRefNum: "never-return-host-reference",
    paypalOrderId: "never-return-paypal-order",
    paypalCaptureId: "never-return-paypal-capture",
    bankOperations: { raw: "never-return-bank-operations" },
    bankOperationLock: "never-return-lock",
    bankOperationsRevision: 3,
    bankLastInquiry: { raw: "never-return-bank-inquiry" },
    reconciliationLeaseToken: "never-return-reconciliation-token",
    reconciliationLeaseUntil: "2026-11-12T12:00:00.000Z",
    reconciliationNextAt: "2026-11-12T12:00:00.000Z",
    reconciliationCheckedAt: "2026-11-11T12:00:00.000Z",
    conversionEventsSentAt: "2026-11-12T12:00:00.000Z",
    conversionFailedEventsSentAt: "2026-11-12T12:00:00.000Z",
  };
  const safe = donationListSafeFields(fixture);
  for (const key of PRIVATE_DONATION_LIST_KEYS) {
    assert.equal(Object.hasOwn(safe, key), false, key);
  }
  assert.equal(safe.id, fixture.id);
  assert.equal(safe.status, "PAID");
  assert.equal(safe.amountUSD, 12.5);
  assert.equal(safe.provider, "ALBARAKA");
  assert.equal((safe as Record<string, unknown>).accessToken, undefined);
  assert.equal(fixture.accessToken, "never-return-receipt-bearer", "input remains available for internal use");
  assert.equal(JSON.stringify(safe).includes("never-return"), false);
});

test("the donation GET response applies redaction at serialization boundary", () => {
  const source = readFileSync("app/api/donations/route.ts", "utf8");
  assert.match(source, /import \{ donationListSafeFields \}/);
  assert.match(source, /\.\.\.donationListSafeFields\(donation\)/);
  assert.doesNotMatch(source, /\.\.\.donation,\s*securityMode/);
});
