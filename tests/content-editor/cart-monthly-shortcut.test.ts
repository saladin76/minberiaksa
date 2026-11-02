import test from "node:test";
import assert from "node:assert/strict";
import { canToggleCartMonthly, toggleCartMonthly, type MinbarCartItem } from "../../lib/minbar/cart";

for (const freqKey of ["daily", "friday"] as const) test(`${freqKey} retains its cadence and schedule when the monthly shortcut is invoked`, () => {
  const item: MinbarCartItem = { freqKey, amount: 1, currency: "USD", schedule: { hour: 9, minute: 0 } };
  assert.equal(canToggleCartMonthly(item), false);
  assert.equal(toggleCartMonthly(item), item);
});
test("one-time and monthly rows can switch without retaining the whole-cart nudge marker", () => {
  const item: MinbarCartItem = { freqKey: "once", amount: 1, currency: "USD", _autoMonthly: true };
  const monthly = toggleCartMonthly(item);
  assert.equal(monthly.freqKey, "monthly");
  assert.equal(monthly._autoMonthly, undefined);
  assert.equal(toggleCartMonthly(monthly).freqKey, "once");
  assert.equal(item.freqKey, "once");
});
