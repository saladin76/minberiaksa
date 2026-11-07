import test from "node:test";
import assert from "node:assert/strict";
import { albarakaCheckoutMode, isMixedRecurringCheckout } from "../../lib/donations/albaraka-checkout-mode";
test("all recurring first payments and renewals require 2D", () => {
  assert.equal(albarakaCheckoutMode("2D", true, true), "2D");
  assert.equal(albarakaCheckoutMode("3D", true, false), "2D");
  assert.equal(albarakaCheckoutMode("3D", false, false), "3D");
  assert.equal(isMixedRecurringCheckout({ one_time_principal: 10, recurring_principal: 5 }), true);
  for (const value of [null, [], {}, { one_time_principal: 0, recurring_principal: 5 }, { one_time_principal: "10", recurring_principal: 5 }]) {
    assert.equal(isMixedRecurringCheckout(value), false);
  }
  assert.throws(() => albarakaCheckoutMode("invalid", true, true), /INVALID_PAYMENT_MODE/);
});

test("all new recurring baskets use Albaraka, including TRY and forced Stripe fallback", async () => {
  const { resolveGateway } = await import("../../lib/payment-gateway");
  for (const donationType of ["DAILY", "FRIDAY", "MONTHLY"] as const) {
    for (const currency of ["TRY", "USD", "EUR", "SAR"]) {
      for (const mainGateway of ["STRIPE", "ALBARAKA"] as const) {
        assert.equal(resolveGateway({ mainGateway, currency, donationType, payforEnabled: true, forceStripe: true }), "ALBARAKA");
        assert.equal(albarakaCheckoutMode("3D", true, true), "2D");
      }
    }
  }
  assert.equal(resolveGateway({ mainGateway: "STRIPE", currency: "TRY", donationType: "ONE_TIME", payforEnabled: true }), "PAYFOR");
  assert.equal(resolveGateway({ mainGateway: "STRIPE", currency: "USD", donationType: "ONE_TIME", payforEnabled: true }), "STRIPE");
});

test("linked records must belong to the same donor/currency and total; only the parent has a subscription", async () => {
  const { validMixedCheckoutPair } = await import("../../lib/donations/mixed-cart");
  const id = "a".repeat(24), childId = "b".repeat(24);
  const parent = { id, donorId: "donor", currency: "TRY", subscriptionId: "plan", totalAmount: 1, providerRaw: { mixedCheckout: { oneTimeDonationId: childId, totalAmount: 2 } } };
  const child = { id: childId, donorId: "donor", currency: "TRY", subscriptionId: null, totalAmount: 1, providerRaw: { mixedCheckoutParentId: id } };
  assert.equal(validMixedCheckoutPair(parent, child), true);
  for (const change of [{ donorId: "another" }, { currency: "USD" }, { subscriptionId: "plan" }, { totalAmount: 2 }, { providerRaw: null }]) {
    assert.equal(validMixedCheckoutPair(parent, { ...child, ...change }), false);
  }
});
