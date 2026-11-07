import test from "node:test";
import assert from "node:assert/strict";
import { CART_TEAM_SUPPORT_KEY, readTeamSupport, readTeamSupportChoice, readTeamSupportLocal, writeTeamSupport, writeCart, rememberCheckoutAttempt, restoreCheckoutAttempt, clearCart } from "../../lib/minbar/cart";

test("500 TRY support retains its exact local value through navigation, reload and failed-payment recovery", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k,v), removeItem: (k: string) => data.delete(k) }, dispatchEvent: () => {} } });
  try {
    writeCart([{ projectId: "example", freqKey: "once", amount: 10, currency: "USD" }]);
    writeTeamSupport(10, { amount: 500, currency: "TRY" });
    assert.equal(readTeamSupport(), 10);
    assert.deepEqual(readTeamSupportLocal(), { amount: 500, currency: "TRY" });
    rememberCheckoutAttempt("attempt");
    clearCart();
    assert.equal(restoreCheckoutAttempt("attempt"), true);
    assert.equal(readTeamSupport(), 10);
    assert.deepEqual(readTeamSupportLocal(), { amount: 500, currency: "TRY" });
    data.set(CART_TEAM_SUPPORT_KEY, "500");
    assert.equal(readTeamSupportChoice(), null, "ambiguous old support must be selected again");
    assert.equal(readTeamSupport(), 0);
    writeTeamSupport(0);
    assert.equal(readTeamSupportChoice(), 0);
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
