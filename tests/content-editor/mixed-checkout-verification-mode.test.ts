import test from "node:test";
import assert from "node:assert/strict";
import { albarakaCheckoutMode, isMixedRecurringCheckout } from "../../lib/donations/albaraka-checkout-mode";
test("mixed first payments require 3D; ordinary periodic renewals retain 2D", () => {
  assert.equal(albarakaCheckoutMode("2D", true, true), "3D");
  assert.equal(albarakaCheckoutMode("3D", true, false), "2D");
  assert.equal(albarakaCheckoutMode("3D", false, false), "3D");
  assert.equal(isMixedRecurringCheckout({ one_time_principal: 10, recurring_principal: 5 }), true);
  for (const value of [null, [], {}, { one_time_principal: 0, recurring_principal: 5 }, { one_time_principal: "10", recurring_principal: 5 }]) {
    assert.equal(isMixedRecurringCheckout(value), false);
  }
  assert.throws(() => albarakaCheckoutMode("invalid", true, true), /INVALID_PAYMENT_MODE/);
});
