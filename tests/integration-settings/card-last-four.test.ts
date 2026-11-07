import test from "node:test";
import assert from "node:assert/strict";
import { cardLastFour, donationCardLastFour } from "../../lib/donations/card-last-four";
test("card display returns only four digits from known card fields and rejects secrets and unrelated numbers", () => {
  for (const pan of ["4242424242424242", "4242 4242 4242 4242", "424242******4242", "XXXX XXXX XXXX 4242", "•••• 4242"]) assert.equal(cardLastFour(pan), "4242");
  for (const value of [null, "123", "12/35", "123456", "iv:encrypted-4242", "account-4242"]) assert.equal(cardLastFour(value), null);
  assert.equal(donationCardLastFour({ providerRaw: { orderId: "1234567890123456", Cvc2: "123", authCode: "123456" } }), null);
});
test("initial payments, masked bank replies and saved recurring cards retain a safe last-four trace", () => {
  assert.equal(donationCardLastFour({ providerRaw: { cardSummary: { last4: "4242" } } }), "4242");
  assert.equal(donationCardLastFour({ providerRaw: { callback: { MaskedPan: "424242******4242" } } }), "4242");
  assert.equal(donationCardLastFour({ encryptedPan: "encrypted" }, () => "4242424242424242"), "4242");
  assert.equal(donationCardLastFour({ encryptedPan: "encrypted" }, () => { throw new Error("invalid key"); }), null);
});
